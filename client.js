(function () {
  const APP_NAME = 'XS Post production timecard';
  const APP_KEY  = '0fc02c029029a4e0d8bfa032fbf58387';

  const KEY_ACTIVE_PREFIX = 'timecard:active:';
  const KEY_DAYLOG_PREFIX = 'timecard:daylog:';
  const CHECKLIST_NAME = 'Time Entries';

  const nowISO = () => new Date().toISOString();
  function fmtHM(mins){ const h=Math.floor(mins/60); const m=mins%60; return `${h}h ${m}m`; }
  function localHHMM(iso){ const d=new Date(iso); const hh=String(d.getHours()).padStart(2,'0'); const mm=String(d.getMinutes()).padStart(2,'0'); return `${hh}:${mm}`; }
  function todayKey(){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }

  async function getActiveStart(t, memberId){ return await t.get('card','shared',KEY_ACTIVE_PREFIX+memberId); }
  async function setActiveStart(t, memberId, isoOrNull){ return await t.set('card','shared',KEY_ACTIVE_PREFIX+memberId, isoOrNull||null); }
  async function pushDayLog(t, memberId, entry){
    const key = KEY_DAYLOG_PREFIX + memberId + ':' + todayKey();
    const list = (await t.get('card','shared',key)) || [];
    list.push(entry);
    await t.set('card','shared',key,list);
  }
  async function getTodayMinutesForMe(t){
    const me = await t.member('id');
    const key = KEY_DAYLOG_PREFIX + me.id + ':' + todayKey();
    const list = (await t.get('card','shared',key)) || [];
    return list.reduce((a,x)=>a+(x.minutes||0),0);
  }

  async function ensureAuthorized(t){
    const api = t.getRestApi();
    const ok = await api.isAuthorized();
    if(!ok){
      await api.authorize({ scope:'read,write', expiration:'never', name: APP_NAME });
    }
  }
  async function addComment(api, cardId, text){ return await api.post(`/cards/${cardId}/actions/comments`,{ text }); }
  async function getOrCreateChecklist(api, cardId, name){
    const arr = await api.get(`/cards/${cardId}/checklists`);
    if(Array.isArray(arr)){
      const found = arr.find(c => (c.name||'').toLowerCase() === name.toLowerCase());
      if(found) return found;
    }
    return await api.post(`/cards/${cardId}/checklists`,{ name });
  }
  async function addChecklistItem(api, checklistId, name){ return await api.post(`/checklists/${checklistId}/checkItems`,{ name }); }

  async function clockIn(t){
    const me = await t.member('id','fullName');
    const active = await getActiveStart(t, me.id);
    if(active){ await t.alert({ message:'你已经在计时中。', duration:4 }); return; }
    await setActiveStart(t, me.id, nowISO());
    await t.alert({ message:'Clock In 开始！', duration:3 });
  }

  async function clockOut(t){
    const me = await t.member('id','fullName');
    const startISO = await getActiveStart(t, me.id);
    if(!startISO){ await t.alert({ message:'当前没有正在计时的记录。', duration:4 }); return; }
    const endISO = nowISO();
    let minutes = Math.round((new Date(endISO)-new Date(startISO))/60000);
    if(minutes<1) minutes=1;

    await pushDayLog(t, me.id, { in:startISO, out:endISO, minutes });
    await setActiveStart(t, me.id, null);

    try{
      await ensureAuthorized(t);
      const api = t.getRestApi();
      const { id: cardId } = await t.card('id');
      const comment = `🕒 ${me.fullName} clocked out — ${fmtHM(minutes)}  (in ${localHHMM(startISO)} → out ${localHHMM(endISO)})`;
      await addComment(api, cardId, comment);
      const checklist = await getOrCreateChecklist(api, cardId, CHECKLIST_NAME);
      const itemText = `⏱ ${fmtHM(minutes)} — ${localHHMM(startISO)} → ${localHHMM(endISO)} (${todayKey()})`;
      await addChecklistItem(api, checklist.id, itemText);
    }catch(e){
      console.warn('Timecard REST error:', e);
      await t.alert({ message:'已结束计时，但写评论/清单失败（可稍后再试）', duration:6 });
    }
    await t.alert({ message:`Clock Out 结束，总计 ${fmtHM(minutes)}`, duration:4 });
  }

  window.TrelloPowerUp.initialize(
    {
      // 看板顶部按钮（用于确认代码加载成功）
      'board-buttons': function(t){
        return [{
          text: 'Timecard',
          callback: function(t){
            return t.popup({ title: 'Timecard Loaded', url: './index.html', height: 120 });
          }
        }];
      },

      // 卡片里的打卡按钮
      'card-buttons': async function(t){
        const me = await t.member('id','fullName');
        const active = await getActiveStart(t, me.id);
        const label = active ? 'Clock Out' : 'Clock In';
        const cb = active ? () => clockOut(t) : () => clockIn(t);
        return [{ text: label, callback: cb }];
      },

      // 今日总时长徽章
      'card-badges': async function(t){
        const mins = await getTodayMinutesForMe(t);
        if(mins<=0) return [];
        return [{ text: 'Today: ' + fmtHM(mins), color: 'blue' }];
      },

      // 设置页（可选）
      'show-settings': function(t){
        return t.modal({ title:'Timecard Settings', url:'./index.html', height:220 });
      }
    },
    { appKey: APP_KEY, appName: APP_NAME }
  );
})();
