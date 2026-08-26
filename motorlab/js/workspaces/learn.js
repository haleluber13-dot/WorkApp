/* Learn — lessons, quizzes, achievements and challenges. */
import { h, section, kv, note, para, chip, btn, toast, modal, bar } from '../ui.js';
import { state, save } from '../store.js';
import { MODULES, ALL_LESSONS, LESSON_BY_ID, TOTAL_XP } from '../data/curriculum.js';
import { addXp, unlock, progressSummary, ACHIEVEMENTS, CHALLENGES, levelFor, evaluateChallenges } from '../game.js';

export function render(ctx, tab){
  const wrap = h('div');
  if (tab === 'progress')   return renderProgress(ctx, wrap);
  if (tab === 'challenges') return renderChallenges(ctx, wrap);

  const done = ALL_LESSONS.filter(l => state.lessons[l.id]?.done).length;
  wrap.append(
    h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:'Course progress' }), chip(`${done}/${ALL_LESSONS.length}`, done === ALL_LESSONS.length ? 'ok' : '')),
      bar(done/ALL_LESSONS.length, done === ALL_LESSONS.length ? 'ok' : ''),
      h('div', { class:'tiny muted', style:{ marginTop:'6px' },
        text:`${MODULES.length} modules · ${ALL_LESSONS.reduce((s,l)=>s+l.quiz.length,0)} quiz questions · ${TOTAL_XP} XP available` })),
  );

  for (const mod of MODULES){
    const mDone = mod.lessons.filter(l => state.lessons[l.id]?.done).length;
    wrap.append(h('div', { class:'grp' },
      h('div', { class:'grp__h' }, h('span', { text:`${mod.icon}  ${mod.name}` }),
        h('span', { class:'grp__bar' }, h('i', { style:{ width:(mDone/mod.lessons.length*100)+'%' } })),
        h('span', { class:'tiny', text:`${mDone}/${mod.lessons.length}` })),
      h('div', { class:'plist' }, ...mod.lessons.map(l => {
        const rec = state.lessons[l.id];
        return h('div', { class:'pitem' + (rec?.done ? ' installed' : ''), onclick:() => openLesson(ctx, l.id) },
          h('span', { class:'pitem__st' }),
          h('span', { class:'pitem__n', text:l.title }),
          h('span', { class:'pitem__q', text: rec?.score != null ? `${rec.score}/${l.quiz.length}` : `${l.minutes} min` }));
      }))));
  }
  return wrap;
}

export function openLesson(ctx, id){
  const l = LESSON_BY_ID[id]; if (!l) return;
  const body = h('div');
  body.append(
    h('div', { class:'tiny muted', style:{ marginBottom:'8px' }, text:`${l.moduleName} · ${l.minutes} min · ${l.xp} XP` }),
    ...l.body.map(t => para(mdBold(t))),
  );
  if (l.steps?.length) body.append(section('Try it yourself',
    h('ol', { class:'steps' }, ...l.steps.map(s => h('li', { text:s })))));

  let answers = {};
  if (l.quiz.length){
    body.append(h('div', { class:'sec__h', style:{ marginTop:'14px' } }, h('span', { text:'Check yourself' })));
    l.quiz.forEach((q, qi) => {
      const opts = h('div', { class:'plist' });
      q.options.forEach((o, oi) => {
        const row = h('div', { class:'pitem', onclick:() => {
          if (answers[qi] != null) return;
          answers[qi] = oi;
          [...opts.children].forEach((c, ci) => {
            c.classList.remove('on');
            if (ci === q.answer) c.classList.add('installed');
            if (ci === oi && oi !== q.answer) c.style.borderColor = 'var(--bad)';
          });
          why.hidden = false;
          why.className = 'note ' + (oi === q.answer ? '' : 'warn');
          why.innerHTML = (oi === q.answer ? '<b>Correct.</b> ' : '<b>Not quite.</b> ') + q.why;
        } }, h('span', { class:'pitem__st' }), h('span', { class:'pitem__n', text:o }));
        opts.appendChild(row);
      });
      const why = h('div', { class:'note', hidden:true });
      body.append(h('div', { class:'card' }, h('div', { class:'card__t', text:q.q }), opts, why));
    });
  }

  modal({ title:l.title, wide:true, body, actions:[
    { label:'Open the workspace', onClick:() => { ctx.goto(l.ws); } },
    { label:'Mark complete', primary:true, onClick:() => {
      const score = l.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0);
      const first = !state.lessons[l.id]?.done;
      state.lessons[l.id] = { done:true, score, of:l.quiz.length };
      save();
      if (first) addXp(l.xp + score * 10, `Lesson: ${l.title}`);
      const allDone = ALL_LESSONS.every(x => state.lessons[x.id]?.done);
      if (allDone) unlock('scholar');
      const perfect = ALL_LESSONS.filter(x => state.lessons[x.id]?.of && state.lessons[x.id].score === state.lessons[x.id].of).length;
      evaluateChallenges({ perfectQuizzes:perfect, totalQuizzes:ALL_LESSONS.filter(x => x.quiz.length).length });
      toast(l.quiz.length ? `Lesson complete — ${score}/${l.quiz.length} correct.` : 'Lesson complete.', 'good');
      ctx.refresh();
    } },
  ]});
}
function mdBold(t){ return t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); }

function renderProgress(ctx, wrap){
  const s = progressSummary();
  const lv = s.level;
  wrap.append(
    h('div', { class:'sec' },
      h('div', { class:'sec__h' }, h('span', { text:'Rank' }), chip(lv.title, 'acc')),
      h('h3', { style:{ fontSize:'22px', marginBottom:'4px' }, text:`Level ${lv.lvl}` }),
      bar(lv.progress),
      kv('XP', `${s.xp}${lv.next ? ` / ${lv.next.xp}` : ''}`),
      lv.next ? kv('To next rank', `${lv.toNext} XP — ${lv.next.title}`) : kv('Rank', 'Maximum'),
      kv('Credits', '$' + s.credits.toLocaleString()),
      kv('Achievements', `${s.achievements} / ${s.totalAchievements}`),
      kv('Challenges', `${s.challenges} / ${s.totalChallenges}`)),
    section('Achievements',
      ...ACHIEVEMENTS.map(a => {
        const got = state.game.achievements.includes(a.id);
        return h('div', { class:'pitem' + (got ? ' installed' : ' blocked') },
          h('span', { class:'pitem__st' }),
          h('span', { class:'pitem__n' }, `${a.icon}  ${a.name} — `, h('span', { class:'muted tiny', text:a.desc })),
          h('span', { class:'pitem__q', text:'+' + a.xp }));
      })),
  );
  return wrap;
}

function renderChallenges(ctx, wrap){
  wrap.append(para('Build objectives with real conditions. They are checked automatically whenever you run the dyno, complete a lap or finish a build.'));
  for (const c of CHALLENGES){
    const done = state.game.challenges[c.id]?.done;
    wrap.append(h('div', { class:'card' + (done ? ' on' : '') },
      h('div', { class:'card__h' },
        h('div', null, h('div', { class:'card__t', text:c.name })),
        done ? chip('complete','ok') : chip('$' + c.reward, 'acc')),
      h('div', { class:'card__b', text:c.brief }),
      h('div', { class:'btnrow', style:{ marginTop:'8px' } },
        btn('Go there', { onClick:() => ctx.goto(c.ws) }))));
  }
  return wrap;
}

export default {
  id:'learn', name:'Learn', icon:'🎓', model:null,
  tabs:() => [{ id:'lessons', name:'Lessons' }, { id:'challenges', name:'Challenges' }, { id:'progress', name:'Progress' }],
  render,
  hud:() => {
    const s = progressSummary();
    return { title:'Learning', sub:`Level ${s.level.lvl} ${s.level.title} · ${s.xp} XP` };
  },
};
