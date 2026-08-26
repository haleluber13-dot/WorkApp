"""Tests for the parts that can be checked without a phone.

Run them anywhere:  python3 -m unittest discover -s tests
"""

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import assistant  # noqa: E402
import gemini  # noqa: E402
import termux  # noqa: E402
import tools  # noqa: E402
import voice  # noqa: E402


class FakeHTTPError(urllib.error.HTTPError):
    """An HTTPError whose body can be read, like a real one."""

    def __init__(self, code, body=""):
        super().__init__("https://example.invalid", code, "err", {}, None)
        self._body = body.encode("utf-8")

    def read(self):
        return self._body


class BuildContentsTest(unittest.TestCase):
    def test_history_and_prompt_become_one_list(self):
        contents = gemini.build_contents(
            [("user", "hi"), ("model", "hello")], "how are you"
        )
        self.assertEqual(
            contents,
            [
                {"role": "user", "parts": [{"text": "hi"}]},
                {"role": "model", "parts": [{"text": "hello"}]},
                {"role": "user", "parts": [{"text": "how are you"}]},
            ],
        )

    def test_unknown_role_is_rejected(self):
        with self.assertRaises(ValueError):
            gemini.build_contents([("assistant", "hi")], "x")


class ExtractTextTest(unittest.TestCase):
    def test_joins_the_parts(self):
        response = {
            "candidates": [
                {"content": {"parts": [{"text": "one "}, {"text": "two"}]}}
            ]
        }
        self.assertEqual(gemini.extract_text(response), "one two")

    def test_blocked_prompt_explains_itself(self):
        with self.assertRaises(gemini.GeminiError) as caught:
            gemini.extract_text({"promptFeedback": {"blockReason": "SAFETY"}})
        self.assertIn("SAFETY", str(caught.exception))

    def test_truncated_answer_points_at_the_limit(self):
        response = {"candidates": [{"finishReason": "MAX_TOKENS", "content": {}}]}
        with self.assertRaises(gemini.GeminiError) as caught:
            gemini.extract_text(response)
        self.assertIn("max-tokens", str(caught.exception))

    def test_no_candidates_is_an_error(self):
        with self.assertRaises(gemini.GeminiError):
            gemini.extract_text({"candidates": []})


class ErrorMessageTest(unittest.TestCase):
    def test_invalid_key_names_the_key(self):
        error = gemini._explain_http_error(
            FakeHTTPError(400, '{"error":{"message":"API_KEY_INVALID"}}'), "m"
        )
        self.assertIn("API key", str(error))

    def test_unknown_model_suggests_listing_models(self):
        error = gemini._explain_http_error(FakeHTTPError(404), "gemini-9-turbo")
        self.assertIn("gemini-9-turbo", str(error))
        self.assertIn("--models", str(error))

    def test_quota_error_says_to_wait(self):
        error = gemini._explain_http_error(FakeHTTPError(429), "m")
        self.assertIn("quota", str(error).lower())


class RetryTest(unittest.TestCase):
    def test_retries_then_succeeds(self):
        attempts = []

        def flaky(url, payload, key, timeout):
            attempts.append(url)
            if len(attempts) < 3:
                raise FakeHTTPError(503)
            return {"ok": True}

        with mock.patch.object(gemini, "_request", flaky):
            result = gemini._call("u", {}, "k", 5, 3, "m", sleep=lambda _: None)
        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(attempts), 3)

    def test_bad_key_is_not_retried(self):
        attempts = []

        def always_400(url, payload, key, timeout):
            attempts.append(url)
            raise FakeHTTPError(400, '{"error":{"message":"API_KEY_INVALID"}}')

        with mock.patch.object(gemini, "_request", always_400):
            with self.assertRaises(gemini.GeminiError):
                gemini._call("u", {}, "k", 5, 3, "m", sleep=lambda _: None)
        self.assertEqual(len(attempts), 1)

    def test_offline_phone_gets_a_plain_message(self):
        def offline(url, payload, key, timeout):
            raise urllib.error.URLError("Name or service not known")

        with mock.patch.object(gemini, "_request", offline):
            with self.assertRaises(gemini.GeminiError) as caught:
                gemini._call("u", {}, "k", 5, 2, "m", sleep=lambda _: None)
        self.assertIn("online", str(caught.exception))


class KeyTest(unittest.TestCase):
    def test_environment_wins(self):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": " abc "}):
            self.assertEqual(gemini.find_key(), "abc")

    def test_file_is_the_fallback(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "key")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("from-file\n")
            with mock.patch.dict(os.environ, {}, clear=True), \
                 mock.patch.object(gemini, "KEY_FILE", path):
                self.assertEqual(gemini.find_key(), "from-file")

    def test_missing_key_says_where_to_get_one(self):
        with mock.patch.dict(os.environ, {}, clear=True), \
             mock.patch.object(gemini, "KEY_FILE", "/nope/nothing"):
            with self.assertRaises(gemini.GeminiError) as caught:
                gemini.find_key()
        self.assertIn("aistudio.google.com", str(caught.exception))


class DiagnosisTest(unittest.TestCase):
    """A timeout means different things depending on what else works."""

    @staticmethod
    def _phone(battery_answers):
        def run(command, **kwargs):
            if command[0] == "termux-battery-status" and battery_answers:
                return subprocess.CompletedProcess(command, 0, "{}", "")
            raise subprocess.TimeoutExpired(command[0], 8)
        return run

    def test_a_dead_app_is_named_as_the_cause(self):
        with mock.patch.object(termux.shutil, "which", return_value="/bin/x"), \
             mock.patch.object(termux.subprocess, "run", self._phone(False)):
            _, _, problem = termux.run(["termux-tts-speak", "hi"], 8)
        self.assertIn("Termux:API app is not answering", problem)

    def test_a_live_app_points_at_the_feature_instead(self):
        with mock.patch.object(termux.shutil, "which", return_value="/bin/x"), \
             mock.patch.object(termux.subprocess, "run", self._phone(True)):
            _, _, problem = termux.run(["termux-tts-speak", "hi"], 8)
        self.assertIn("Text-to-speech", problem)
        self.assertNotIn("not answering", problem)

    def test_the_microphone_gets_microphone_advice(self):
        with mock.patch.object(termux.shutil, "which", return_value="/bin/x"), \
             mock.patch.object(termux.subprocess, "run", self._phone(True)):
            _, _, problem = termux.run(["termux-speech-to-text"], 8)
        self.assertIn("Microphone", problem)

    def test_the_probe_itself_does_not_probe_itself(self):
        """Or a dead phone would recurse until the stack gave out."""
        with mock.patch.object(termux.shutil, "which", return_value="/bin/x"), \
             mock.patch.object(termux.subprocess, "run", self._phone(False)):
            _, _, problem = termux.run(["termux-battery-status"], 8)
        self.assertIn("Termux:API app is not answering", problem)


class VoiceTest(unittest.TestCase):
    def test_a_hang_turns_voice_off_instead_of_blocking(self):
        speaker = voice.Voice()
        with mock.patch.object(termux.shutil, "which", return_value="/bin/x"), \
             mock.patch.object(
                 termux.subprocess,
                 "run",
                 side_effect=subprocess.TimeoutExpired("termux-tts-speak", 25),
             ):
            self.assertFalse(speaker.speak("hello"))
        self.assertIn("Termux:API", speaker.last_problem)
        self.assertFalse(speaker.enabled)

    def test_missing_command_is_reported_not_raised(self):
        with mock.patch.object(termux.shutil, "which", return_value=None):
            ok, _, problem = termux.run(["termux-tts-speak", "hi"], 5)
        self.assertFalse(ok)
        self.assertIn("pkg install termux-api", problem)

    def test_speaking_passes_the_language_through(self):
        seen = {}

        def fake_run(command, **kwargs):
            seen["command"] = command
            seen["stdin"] = kwargs.get("stdin")
            return subprocess.CompletedProcess(command, 0, "", "")

        speaker = voice.Voice(lang="he-IL")
        with mock.patch.object(termux.shutil, "which", return_value="/bin/x"), \
             mock.patch.object(termux.subprocess, "run", fake_run):
            self.assertTrue(speaker.speak("שלום"))
        self.assertEqual(seen["command"], ["termux-tts-speak", "-l", "he-IL", "שלום"])
        # stdin must be closed, or the command can sit waiting for input.
        self.assertEqual(seen["stdin"], subprocess.DEVNULL)

    def test_nothing_is_spoken_when_voice_is_off(self):
        speaker = voice.Voice(enabled=False)
        with mock.patch.object(termux.subprocess, "run") as run:
            self.assertFalse(speaker.speak("hello"))
        run.assert_not_called()


class HistoryTest(unittest.TestCase):
    def test_saved_history_comes_back(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "history.json")
            with mock.patch.object(assistant, "HOME", folder), \
                 mock.patch.object(assistant, "HISTORY_FILE", path):
                assistant.save_history([("user", "שלום"), ("model", "hi")])
                self.assertEqual(
                    assistant.load_history(), [("user", "שלום"), ("model", "hi")]
                )

    def test_history_is_trimmed_to_the_recent_past(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "history.json")
            long = [("user", str(n)) for n in range(200)]
            with mock.patch.object(assistant, "HOME", folder), \
                 mock.patch.object(assistant, "HISTORY_FILE", path):
                assistant.save_history(long)
                self.assertEqual(
                    len(assistant.load_history()), assistant.MAX_TURNS * 2
                )

    def test_a_corrupt_file_does_not_stop_the_assistant(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "history.json")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("{not json")
            with mock.patch.object(assistant, "HISTORY_FILE", path):
                self.assertEqual(assistant.load_history(), [])

    def test_junk_entries_are_dropped(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "history.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(
                    [{"role": "user", "text": "keep"}, {"role": "robot", "text": "drop"}],
                    handle,
                )
            with mock.patch.object(assistant, "HISTORY_FILE", path):
                self.assertEqual(assistant.load_history(), [("user", "keep")])


class ListModelsTest(unittest.TestCase):
    def test_only_models_that_can_answer_are_listed(self):
        response = {
            "models": [
                {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
                {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
            ]
        }
        with mock.patch.object(gemini, "_request", return_value=response):
            names = gemini.list_models(key="k")
        self.assertEqual(names, ["gemini-2.5-flash"])


class ToolTest(unittest.TestCase):
    def test_every_tool_declares_itself_legally(self):
        for tool in tools.ALL:
            declared = tool.declaration()
            self.assertTrue(declared["name"])
            self.assertTrue(declared["description"])
            for name in tool.required:
                self.assertIn(
                    name,
                    declared.get("parameters", {}).get("properties", {}),
                    f"{tool.name} requires an argument it never declared: {name}",
                )

    def test_shell_is_hidden_unless_asked_for(self):
        names = [tool.name for tool in tools.available(allow_shell=False)]
        self.assertNotIn("run_shell", names)
        self.assertIn("run_shell", [t.name for t in tools.available(allow_shell=True)])

    def test_a_hidden_tool_cannot_be_called_even_if_the_model_asks(self):
        answer = tools.execute(
            "run_shell", {"command": "rm -rf ~"}, tools.available(allow_shell=False)
        )
        self.assertIn("not a tool", answer)

    def test_saying_no_stops_the_action(self):
        with mock.patch.object(termux, "run") as run:
            answer = tools.execute(
                "send_sms",
                {"number": "050", "message": "hi"},
                tools.available(),
                ask=lambda _: False,
            )
        run.assert_not_called()
        self.assertIn("said no", answer)

    def test_saying_yes_runs_it(self):
        with mock.patch.object(termux, "run", return_value=(True, "", "")) as run:
            answer = tools.execute(
                "send_sms",
                {"number": "050", "message": "hi"},
                tools.available(),
                ask=lambda _: True,
            )
        run.assert_called_once()
        self.assertEqual(run.call_args[0][0], ["termux-sms-send", "-n", "050", "hi"])
        self.assertIn("sent", answer)

    def test_harmless_tools_never_ask(self):
        asked = []
        with mock.patch.object(termux, "run", return_value=(True, "", "")):
            tools.execute("torch", {"on": True}, tools.available(), ask=asked.append)
        self.assertEqual(asked, [])

    def test_a_broken_tool_reports_instead_of_crashing(self):
        with mock.patch.object(termux, "run", side_effect=RuntimeError("boom")):
            answer = tools.execute("battery", {}, tools.available())
        self.assertIn("boom", answer)

    def test_the_clock_works_without_a_phone(self):
        answer = tools.execute("current_time", {}, tools.available())
        self.assertRegex(answer, r"\d{2}:\d{2}")

    def test_whatsapp_url_is_built_from_digits_only(self):
        with mock.patch.object(termux, "run", return_value=(True, "", "")) as run:
            tools.execute(
                "whatsapp",
                {"number": "+972-50-123 4567", "message": "שלום"},
                tools.available(),
                ask=lambda _: True,
            )
        url = run.call_args[0][0][1]
        self.assertTrue(url.startswith("https://wa.me/972501234567?text="))


class ToolLoopTest(unittest.TestCase):
    def test_a_reply_can_carry_words_and_an_action(self):
        response = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "lighting it up"},
                            {"functionCall": {"name": "torch", "args": {"on": True}}},
                        ]
                    }
                }
            ]
        }
        text, calls = gemini.split_parts(response)
        self.assertEqual(text, "lighting it up")
        self.assertEqual(calls, [{"name": "torch", "args": {"on": True}}])

    def test_plain_answers_have_no_calls(self):
        response = {"candidates": [{"content": {"parts": [{"text": "hello"}]}}]}
        self.assertEqual(gemini.split_parts(response), ("hello", []))

    def test_the_result_of_an_action_goes_back_to_the_model(self):
        sent = []
        replies = [
            {
                "candidates": [
                    {"content": {"parts": [
                        {"functionCall": {"name": "battery", "args": {}}}
                    ]}}
                ]
            },
            {"candidates": [{"content": {"parts": [{"text": "You are at 71%."}]}}]},
        ]

        def fake_request(url, payload, key, timeout):
            sent.append(payload)
            return replies[len(sent) - 1]

        args = assistant.build_parser().parse_args([])
        with mock.patch.object(gemini, "_request", fake_request), \
             mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k"}), \
             mock.patch.object(termux, "run", return_value=(True, '{"percentage": 71}', "")):
            answer, _ = assistant.answer(args, [], "how is my battery", tools.available())

        self.assertEqual(answer, "You are at 71%.")
        # The second request must carry the tool's result back.
        second = json.dumps(sent[1])
        self.assertIn("functionResponse", second)
        self.assertIn("71", second)

    def test_the_loop_gives_up_rather_than_spinning(self):
        forever = {
            "candidates": [
                {"content": {"parts": [
                    {"functionCall": {"name": "battery", "args": {}}}
                ]}}
            ]
        }
        args = assistant.build_parser().parse_args([])
        with mock.patch.object(gemini, "_request", return_value=forever), \
             mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k"}), \
             mock.patch.object(termux, "run", return_value=(True, "{}", "")):
            answer, done = assistant.answer(args, [], "loop", tools.available())
        self.assertIn("too many steps", answer.lower())
        self.assertEqual(len(done), assistant.MAX_TOOL_STEPS)



class ChooseModelTest(unittest.TestCase):
    def test_prefers_a_fast_current_model(self):
        self.assertEqual(
            gemini.choose_model(["gemini-2.5-pro", "gemini-2.5-flash"]),
            "gemini-2.5-flash",
        )

    def test_falls_back_through_the_generations(self):
        self.assertEqual(
            gemini.choose_model(["gemini-2.0-flash", "gemini-pro-latest"]),
            "gemini-2.0-flash",
        )

    def test_skips_models_built_for_another_job(self):
        chosen = gemini.choose_model(
            ["gemini-2.5-flash-image-preview", "gemini-2.5-flash-preview-tts",
             "gemini-2.5-flash-preview-09-2025"]
        )
        self.assertEqual(chosen, "gemini-2.5-flash-preview-09-2025")

    def test_an_unknown_future_model_is_still_usable(self):
        self.assertEqual(gemini.choose_model(["gemini-9-flash"]), "gemini-9-flash")

    def test_a_key_with_no_chat_model_returns_nothing(self):
        self.assertIsNone(gemini.choose_model(["text-embedding-004"]))
        self.assertIsNone(gemini.choose_model([]))


class ModelRepairTest(unittest.TestCase):
    def test_a_missing_model_is_replaced_and_remembered(self):
        class Missing(urllib.error.HTTPError):
            def __init__(self):
                super().__init__("u", 404, "err", {}, None)

            def read(self):
                return b'{"error":{"message":"not found"}}'

        def fake_request(url, payload, key, timeout):
            if url.endswith("/models"):
                return {"models": [{
                    "name": "models/gemini-flash-latest",
                    "supportedGenerationMethods": ["generateContent"],
                }]}
            if "gemini-2.5-flash" in url:
                raise Missing()
            return {"candidates": [{"content": {"parts": [{"text": "done"}]}}]}

        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "model")
            args = assistant.build_parser().parse_args(["--quiet"])
            args.model = "gemini-2.5-flash"
            with mock.patch.object(gemini, "_request", fake_request), \
                 mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k"}), \
                 mock.patch.object(assistant, "HOME", folder), \
                 mock.patch.object(assistant, "MODEL_FILE", path), \
                 mock.patch.object(assistant, "SYSTEM_FILE", "/nonexistent"), \
                 mock.patch.object(sys, "stderr", io.StringIO()):
                text, _ = assistant.run_once(args, voice.Voice(enabled=False), "hi", [])

            self.assertEqual(text, "done")
            self.assertEqual(args.model, "gemini-flash-latest")
            with open(path, encoding="utf-8") as handle:
                self.assertEqual(handle.read().strip(), "gemini-flash-latest")

    def test_other_errors_are_not_swallowed_by_the_repair(self):
        def always_401(url, payload, key, timeout):
            raise FakeHTTPError(401, "nope")

        args = assistant.build_parser().parse_args(["--quiet"])
        with mock.patch.object(gemini, "_request", always_401), \
             mock.patch.dict(os.environ, {"GEMINI_API_KEY": "k"}), \
             mock.patch.object(assistant, "SYSTEM_FILE", "/nonexistent"):
            with self.assertRaises(gemini.GeminiError):
                assistant.run_once(args, voice.Voice(enabled=False), "hi", [])



class AppToolTest(unittest.TestCase):
    def test_navigation_builds_a_waze_link(self):
        with mock.patch.object(termux, "run", return_value=(True, "", "")) as run:
            tools.execute("navigate", {"destination": "תל אביב"}, tools.available())
        url = run.call_args[0][0][1]
        self.assertIn("waze.com/ul?q=", url)
        self.assertIn("navigate=yes", url)

    def test_google_maps_when_asked_for(self):
        with mock.patch.object(termux, "run", return_value=(True, "", "")) as run:
            tools.execute(
                "navigate", {"destination": "Haifa", "app": "google"}, tools.available()
            )
        self.assertIn("google.com/maps/dir", run.call_args[0][0][1])

    def test_music_asks_android_before_falling_back_to_spotify(self):
        with mock.patch.object(termux, "run", return_value=(True, "", "")) as run:
            answer = tools.execute(
                "play_music", {"query": "Miles Davis"}, tools.available()
            )
        command = run.call_args[0][0]
        self.assertIn("android.media.action.MEDIA_PLAY_FROM_SEARCH", command)
        self.assertIn("Miles Davis", command)
        self.assertIn("playing", answer.lower())

    def test_music_falls_back_when_no_player_answers(self):
        results = [(False, "", "no activity found"), (True, "", "")]
        with mock.patch.object(termux, "run", side_effect=results) as run:
            answer = tools.execute("play_music", {"query": "כוורת"}, tools.available())
        self.assertIn("spotify:search:", run.call_args[0][0][1])
        self.assertIn("Spotify", answer)

    def test_an_unknown_app_is_searched_for_rather_than_failing(self):
        with mock.patch.object(termux, "run", return_value=(True, "", "")) as run:
            answer = tools.execute(
                "open_app", {"name": "some app I invented"}, tools.available()
            )
        self.assertIn("google.com/search", run.call_args[0][0][1])
        self.assertIn("searched", answer)

    def test_reading_messages_needs_a_yes(self):
        with mock.patch.object(termux, "run") as run:
            tools.execute(
                "read_messages", {}, tools.available(), ask=lambda _: False
            )
        run.assert_not_called()


class JarvisPresetTest(unittest.TestCase):
    def test_one_flag_sets_voice_microphone_and_manner(self):
        args = assistant.apply_jarvis(
            assistant.build_parser().parse_args(["--jarvis"])
        )
        self.assertTrue(args.mic)
        self.assertTrue(args.voice)
        self.assertEqual(args.persona, "jarvis")
        self.assertLess(args.pitch, 1.0, "his voice is deeper than the default")
        self.assertLessEqual(args.rate, 1.0)

    def test_what_the_user_asked_for_is_not_overridden(self):
        args = assistant.apply_jarvis(
            assistant.build_parser().parse_args(
                ["--jarvis", "--pitch", "1.4", "--persona", "plain"]
            )
        )
        self.assertEqual(args.pitch, 1.4)
        self.assertEqual(args.persona, "plain")


class ConversationTest(unittest.TestCase):
    def test_the_words_that_end_it(self):
        for word in ("stop", "Stop.", "די", "להתראות", "that's all"):
            self.assertTrue(assistant.is_goodbye(word), word)

    def test_ordinary_speech_does_not_end_it(self):
        for word in ("stop the music", "play something", "מה השעה"):
            self.assertFalse(assistant.is_goodbye(word), word)

    def test_the_persona_is_read_from_the_project(self):
        text = assistant.load_system("jarvis")
        self.assertIn("Jarvis", text)
        self.assertNotIn("*", text)  # it is spoken aloud; no markdown

    def test_an_unknown_persona_falls_back_instead_of_crashing(self):
        with mock.patch.object(sys, "stderr", io.StringIO()), \
             mock.patch.object(assistant, "SYSTEM_FILE", "/nonexistent"):
            self.assertEqual(assistant.load_system("nobody"), assistant.DEFAULT_SYSTEM)

    def test_a_microphone_that_fails_hands_back_the_keyboard_at_once(self):
        """A broken mic must not be retried; it must say so and step aside."""
        args = assistant.build_parser().parse_args(["--mic", "--quiet", "--no-memory"])
        attempts = []

        def failing(command, timeout=20, stdin_text=None):
            if command[0] == voice.LISTEN_CMD:
                attempts.append(1)
                return False, "", termux.API_MISSING_HELP
            return True, "", ""

        typed = iter(["/quit"])
        with mock.patch.object(termux, "run", failing), \
             mock.patch.object(termux, "have", return_value=True), \
             mock.patch.object(sys, "stderr", io.StringIO()) as complaint, \
             mock.patch.object(assistant, "can_type", return_value=True), \
             mock.patch("builtins.input", lambda _="": next(typed)):
            assistant.converse(args, voice.Voice(enabled=False))

        self.assertEqual(len(attempts), 1, "it tried the broken microphone twice")
        self.assertFalse(args.mic, "it should have switched to typing")
        self.assertIn("Microphone", complaint.getvalue())

    def test_with_no_keyboard_either_it_simply_stops(self):
        args = assistant.build_parser().parse_args(["--mic", "--quiet", "--no-memory"])

        def failing(command, timeout=20, stdin_text=None):
            if command[0] == voice.LISTEN_CMD:
                return False, "", "no"
            return True, "", ""

        with mock.patch.object(termux, "run", failing), \
             mock.patch.object(termux, "have", return_value=True), \
             mock.patch.object(sys, "stderr", io.StringIO()), \
             mock.patch.object(assistant, "can_type", return_value=False):
            self.assertEqual(assistant.converse(args, voice.Voice(enabled=False)), 0)

    def test_a_dead_microphone_stops_the_loop_instead_of_spinning(self):
        args = assistant.build_parser().parse_args(["--mic", "--quiet", "--no-memory"])
        attempts = []

        class DeafVoice(voice.Voice):
            def listen(self, timeout=60):
                attempts.append(1)
                return ""

            def speak(self, text):
                return True

        with mock.patch.object(termux, "run", return_value=(True, "", "")), \
             mock.patch.object(termux, "have", return_value=True):
            assistant.converse(args, DeafVoice())

        self.assertEqual(len(attempts), 3, "it should give up after three silences")



if __name__ == "__main__":
    unittest.main()
