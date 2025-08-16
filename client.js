/* Trello Timecard - client.js
   Per-member clock in/out on each card. Stores data in card shared pluginData.
   No server needed. Pure Power-Up client.
*/

(function(){
  'use strict';

  // ------- Config -------
  const ICON_LIGHT = 'https://jimeng1027.github.io/trello-timecard/clock.svg';
  const ICON_DARK  = 'https://jimeng1027.github.io/trello-timecard/clock.svg';

  // Keys under card/shared plugin data (per member)
  const KEY_ACTIVE_PREFIX = 'timecard:active:'; // active start ISO string
  const KEY_LOG_PREFIX    = 'timecard:log:';    // array of {start,end} ISO

  // ------- Utils -------
  const nowISO = () => new Date().toISOString();

  // local day string (YYYY-MM-DD) for grouping by local day
  function localDayStr(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const y  = dt.getFullYear();
    const m  = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  // minutes between two ISO timestamps (floor to integer minutes)
  function diffMinutes(startISO, endISO){
    const a = new Date(startISO).getTime();
    const b = new Date(endISO).getTime();
    return Math.max(0, Math.floor((b - a) / 60000));
  }

  function fmtHM(mins){
    const h = Math.floor(mins/60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  // ------- Data helpers (per member) -------
  async function me(t){
    return await t.member('id','fullName'); // {id, fullName}
  }

  async function getActiveStart(t, memberId){
    return await t.get('card','shared', KEY_ACTIVE_PREFIX + memberId);
  }

  async function setActiveStart(t, memberId, iso){
    return await t.set('card','shared', KEY_ACTIVE_PREFIX + memberId, iso);
  }

  async function clearActiveStart(t, memberId){
    // t.remove may not exist in very old client lib; fallback to set null
    if (typeof t.remove === 'function'){
      return await t.remove('card','shared', KEY_ACTIVE_PREFIX + memberId);
    }
    return await t.set('card','shared', KEY_ACTIVE_PREFIX + memberId, null);
  }

  async function getLog(t, memberId){
    return (await t.get('card','shared', KEY_LOG_PREFIX + memberId)) || [];
  }

  async function setLog(t, memberId, log){
    return await t.set('card','shared', KEY_LOG_PREFIX + memberId, log);
  }

  // Sum today's minutes (local day) for me (including active running span)
  async function getTodayMinutesForMe(t){
    const m = await me(t);
    const today = localDayStr(new Date());

    const log = await getLog(t, m.id);
    let total = 0;
    for (const e of log){
      if (!e.start || !e.end) continue;
      if (localDayStr(e.start) === today){
        total += diffMinutes(e.start, e.end);
      }
    }
    const active = await getActiveStart(t, m.id);
    if (active && localDayStr(active) === today){
      total += diffMinutes(active, nowISO());
    }
    return total;
  }

  // ------- Actions -------
  async function clockIn(t){
    const m = await me(t);
    const active = await getActiveStart(t, m.id);
    if (active){
      return t.popup({
        title: 'Already Clocked In',
        items: [{text:`You started at ${new Date(active).toLocaleTimeString()}`}]
      });
    }
    await setActiveStart(t, m.id, nowISO());
    return t.popup({ title: 'Clocked In', items: [{text:`Have a productive session, ${m.fullName}!`}] });
  }

  async function clockOut(t){
    const m = await me(t);
    const active = await getActiveStart(t, m.id);
    if (!active){
      return t.popup({
        title: 'Not Clocked In',
        items: [{text:'Click “Clock In” first.'}]
      });
    }
    const end = nowISO();
    const entry = { start: active, end };

    const log = await getLog(t, m.id);
    log.push(entry);
    await setLog(t, m.id, log);
    await clearActiveStart(t, m.id);

    const mins = diffMinutes(active, end);
    return t.popup({
      title: 'Clocked Out',
      items: [{text:`Session: ${fmtHM(mins)} (from ${new Date(active).toLocaleTimeString()} to ${new Date(end).toLocaleTimeString()})`}]
    });
  }

  // ------- UI (capabilities) -------
  window.TrelloPowerUp.initialize({

    // Top of board – a simple check that the Power-Up loaded
    'board-buttons': function(t){
      return [{
        text: 'Timecard',
        icon: { light: ICON_LIGHT, dark: ICON_DARK },
        callback: function(t){
          return t.popup({
            title: 'Timecard',
            items: [{ text: 'Timecard Power-Up loaded.' }]
          });
        }
      }];
    },

    // Right side of card – dynamic Clock In/Out
    'card-buttons': async function(t){
      const m = await me(t);
      const active = await getActiveStart(t, m.id);
      const label  = active ? 'Clock Out' : 'Clock In';
      const cb     = active ? () => clockOut(t) : () => clockIn(t);

      return [{
        text: label,
        icon: ICON_LIGHT,
        callback: cb
      }];
    },

    // Card badges – show today’s total for the current member
    'card-badges': async function(t){
      const mins = await getTodayMinutesForMe(t);
      if (mins <= 0) return [];
      return [{
        text: 'Today: ' + fmtHM(mins),
        icon: ICON_LIGHT,
        color: 'blue'
      }];
    }

    // (Optional) you can add 'show-settings' later to open a modal/popup
  }, {
    appKey:  '0fc02c029029a4e0d8bfa032fbf58387',
    appName: 'XS Post production timecard'
  });

})();

