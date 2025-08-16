(function(){
  const Promise = TrelloPowerUp.Promise;

  const KEY_ENTRIES = 'timecard.entries';
  const KEY_ACTIVE_PREFIX = 'timecard.active.'; // + memberId
  const CHECKLIST_NAME = 'Time Entries';

  const fmtHM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const todayKey = () => {
    const d = new Date();
    return d.toISOString().slice(0,10);
  };

  async function getPluginData(t, scope, key){
    const data = await t.get(scope, 'shared', key);
    return data == null ? null : data;
  }
  async function setPluginData(t, scope, key, value){
    return t.set(scope, 'shared', key, value);
  }

  async function appendChecklistAndComment(t, inISO, outISO, minutes){
    const card = await t.card('id');
    const cardId = card.id;
    const note = `⏱️ Time entry: in ${inISO}, out ${outISO} — ${fmtHM(minutes)}`;
    await t.post('/cards/' + cardId + '/actions/comments', { text: note });
    const checklists = await t.getRestApi().get(`/cards/${cardId}/checklists`);
    let checklist = checklists.find(cl => cl.name === CHECKLIST_NAME);
    if(!checklist){
      checklist = await t.getRestApi().post(`/cards/${cardId}/checklists`, { name: CHECKLIST_NAME });
    }
    await t.getRestApi().post(`/checklists/${checklist.id}/checkItems`, { name: `${todayKey()} • ${fmtHM(minutes)} • ${inISO} → ${outISO}` });
  }

  async function clockIn(t){
    const me = await t.member('id', 'fullName');
    const key = KEY_ACTIVE_PREFIX + me.id;
    const active = await getPluginData(t, 'card', key);
    if(active){
      return t.alert({ message: 'Already clocked in on this card.', duration: 4 });
    }
    const nowISO = new Date().toISOString();
    await setPluginData(t, 'card', key, { inISO: nowISO });
    return t.alert({ message: `Clocked in at ${nowISO}`, duration: 4 });
  }

  async function clockOut(t){
    const me = await t.member('id', 'fullName');
    const key = KEY_ACTIVE_PREFIX + me.id;
    const active = await getPluginData(t, 'card', key);
    if(!active){
      return t.alert({ message: 'You are not clocked in on this card.', duration: 4 });
    }
    const outISO = new Date().toISOString();
    const inISO = active.inISO;
    const minutes = Math.max(1, Math.round((new Date(outISO) - new Date(inISO)) / 60000));
    const entries = (await getPluginData(t, 'card', KEY_ENTRIES)) || [];
    const meId = me.id;
    entries.push({ memberId: meId, inISO, outISO, minutes, day: todayKey() });
    await setPluginData(t, 'card', KEY_ENTRIES, entries);
    await setPluginData(t, 'card', key, null);
    await appendChecklistAndComment(t, inISO, outISO, minutes);
    return t.alert({ message: `Clocked out — ${fmtHM(minutes)} recorded.`, duration: 5 });
  }

  async function getTodayMinutesForMe(t){
    const me = await t.member('id');
    const entries = (await getPluginData(t, 'card', KEY_ENTRIES)) || [];
    const day = todayKey();
    return entries
      .filter(e => e.memberId === me.id && e.day === day)
      .reduce((sum, e) => sum + (e.minutes || 0), 0);
  }

  window.TrelloPowerUp.initialize({
    'card-buttons': function(t, options){
      return Promise.all([
        t.member('id', 'fullName'),
      ]).then(async () => {
        const me = await t.member('id', 'fullName');
        const active = await getPluginData(t, 'card', KEY_ACTIVE_PREFIX + me.id);
        const label = active ? 'Clock Out' : 'Clock In';
        const callback = active ? () => clockOut(t) : () => clockIn(t);
        return [{
          icon: 'https://raw.githubusercontent.com/your-org/your-repo/main/clock.svg',
          text: label,
          callback
        }];
      });
    },

    'card-badges': async function(t){
      const mins = await getTodayMinutesForMe(t);
      if(mins <= 0) return [];
      return [{
        text: 'Today: ' + fmtHM(mins),
        color: 'blue'
      }];
    },

    'show-settings': function(t){
      return t.modal({
        title: 'Timecard Settings',
        url: './settings.html',
        height: 220
      });
    }
  }, { appKey: '0fc02c029029a4e0d8bfa032fbf58387' });

})();
