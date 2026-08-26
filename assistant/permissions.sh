#!/data/data/com.termux/files/usr/bin/bash
# Open the settings pages that matter, instead of hunting for them.
#
#   bash ~/WorkApp/assistant/permissions.sh
#
# Samsung buries these three screens in three different places.

open_page() {
    am start -a "$1" ${2:+-d "$2"} >/dev/null 2>&1 \
        && echo "  opened: $3" \
        || echo "  could not open $3 — find it by hand"
}

echo
echo "1/3  Termux:API permissions — allow Microphone (and Contacts, SMS,"
echo "     Phone, Camera if you want those)."
read -r -p "     press enter to open it... " _ < /dev/tty
open_page android.settings.APPLICATION_DETAILS_SETTINGS package:com.termux.api "Termux:API app info"
echo "     Tap Permissions > Microphone > Allow. Then come back here."
read -r -p "     press enter when done... " _ < /dev/tty

echo
echo "2/3  Battery — Samsung freezes apps you never open, which is what"
echo "     makes these commands hang."
read -r -p "     press enter to open it... " _ < /dev/tty
open_page android.settings.APPLICATION_DETAILS_SETTINGS package:com.termux "Termux app info"
echo "     Battery > Unrestricted. Also: Settings > Battery > Background"
echo "     usage limits > turn OFF 'Put unused apps to sleep', and remove"
echo "     Termux and Termux:API from the sleeping lists."
read -r -p "     press enter when done... " _ < /dev/tty

echo
echo "3/3  Text-to-speech — the voice itself."
read -r -p "     press enter to open it... " _ < /dev/tty
open_page com.android.settings.TTS_SETTINGS "" "text-to-speech settings"
echo "     Pick an engine, install the voice data, press 'Listen to an"
echo "     example'. If it is silent there, it will be silent for him."
read -r -p "     press enter when done... " _ < /dev/tty

echo
echo "Now checking whether it took:"
echo
bash "$(dirname "$(readlink -f "$0")")/doctor.sh"
