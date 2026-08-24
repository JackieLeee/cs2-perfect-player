(function () {
  'use strict';

  function evt(id, title, scene, choices) {
    return { id, title, scene, choices };
  }

  const CATALOG = [
    evt('cs_tactic_leak', '战术泄露', '赛前训练录像疑似被对手获取，教练要求全队保密。', [
      { label: '公开否认并加强 OPSEC', hint: '媒体信任+2，教练信任+3', effects: { mediaTrust: 2, coachTrust: 3 } },
      { label: '内部彻查并调整战术', hint: '意识+1，队内氛围-2', effects: { GMSN: 1, lockerRoomTrust: -2 } }
    ]),
    evt('cs_ban_target', '针对性 Ban 图', '对手连续三场比赛 Ban 你的强图，粉丝开始质疑准备不足。', [
      { label: '加练被 Ban 地图', hint: '心态+1，体力-5', effects: { MENT: 1, stamina: -5 } },
      { label: '主动调整地图池', hint: '意识+1，教练信任+2', effects: { GMSN: 1, coachTrust: 2 } }
    ]),
    evt('cs_utility_fail', '道具失误', '关键局烟雾弹投偏，导致默认战术完全失效。', [
      { label: '赛后加练投掷', hint: '道具+1', effects: { UTLY: 1 } },
      { label: '改打简单默认', hint: '协作+1，争议+2', effects: { TEAM: 1, controversy: 2 } }
    ]),
    evt('cs_eco_gamble', 'ECO 局豪赌', '教练建议在 ECO 局全起沙鹰翻盘，队内意见分裂。', [
      { label: '支持教练决策', hint: '心态+1，教练信任+3', effects: { MENT: 1, coachTrust: 3 } },
      { label: '建议保守保枪', hint: '意识+1，队内氛围+2', effects: { GMSN: 1, lockerRoomTrust: 2 } }
    ]),
    evt('cs_timeout_gone', '暂停用完', '决胜局暂停已耗尽，你需要场上直接指挥。', [
      { label: '冷静布置最后战术', hint: '沟通+1，残局+1', effects: { COMM: 1, CLUT: 1 } },
      { label: '相信默认交给队友', hint: '协作+1', effects: { TEAM: 1 } }
    ]),
    evt('cs_igl_dispute', '指挥权争议', '明星选手公开质疑你的 call，直播片段迅速发酵。', [
      { label: '私下沟通化解', hint: '沟通+1，队内氛围+3', effects: { COMM: 1, lockerRoomTrust: 3 } },
      { label: '坚持权威不换战术', hint: '心态+1，争议+4', effects: { MENT: 1, controversy: 4 } }
    ]),
    evt('cs_rookie_join', '新人入队', '战队签下年轻天才，你的首发位置受到冲击。', [
      { label: '主动带新人训练', hint: '协作+1，领导力+5', effects: { TEAM: 1, leadership: 5 } },
      { label: '用表现回应竞争', hint: '枪法+1，体力-4', effects: { AIM: 1, stamina: -4 } }
    ]),
    evt('cs_star_clash', '明星冲突', '队内两位明星因资源分配发生争执。', [
      { label: '居中调解', hint: '沟通+1，队内氛围+4', effects: { COMM: 1, lockerRoomTrust: 4 } },
      { label: '保持中立专注自己', hint: '稳定+1', effects: { CONS: 1 } }
    ]),
    evt('cs_lang_barrier', '语言沟通问题', '新援英语不流利，战术执行出现延迟。', [
      { label: '简化 call 并用手势', hint: '沟通+1，协作+1', effects: { COMM: 1, TEAM: 1 } },
      { label: '要求翻译随队', hint: '教练信任+2，热度+2', effects: { coachTrust: 2, fame: 2 } }
    ]),
    evt('cs_coach_swap', '教练换人', '战队突然宣布更换主教练，战术体系需要重建。', [
      { label: '快速适应新体系', hint: '意识+1，教练信任+2', effects: { GMSN: 1, coachTrust: 2 } },
      { label: '向新教练展示价值', hint: '沟通+1，粉丝+2', effects: { COMM: 1, fanSupport: 2 } }
    ]),
    evt('cs_hltv_comment', 'HLTV 评论', 'HLTV 论坛热帖质疑你的表现「过誉」。', [
      { label: '无视噪音', hint: '心态+1，媒体压力-3', effects: { MENT: 1, mediaPressure: -3 } },
      { label: '下一场用数据回应', hint: '枪法+1，媒体压力+2', effects: { AIM: 1, mediaPressure: 2 } }
    ]),
    evt('cs_reddit_drama', 'Reddit 热议', 'Reddit 子版出现你的失误集锦，热度飙升。', [
      { label: '关闭社交媒体', hint: '心态+1，热度-2', effects: { MENT: 1, fame: -2 } },
      { label: '发推自嘲化解', hint: '粉丝+3，争议+2', effects: { fanSupport: 3, controversy: 2 } }
    ]),
    evt('cs_interview_fail', '采访翻车', '赛后采访口误引发误解，赞助商表达关切。', [
      { label: '发声明澄清', hint: '媒体信任+3', effects: { mediaTrust: 3 } },
      { label: '减少公开露面', hint: '商业价值-2，媒体压力-4', effects: { businessValue: -2, mediaPressure: -4 } }
    ]),
    evt('cs_stream_contract', '直播合同争议', '战队限制选手直播时长，你与管理层意见不合。', [
      { label: '服从战队规定', hint: '教练信任+3，商业价值-2', effects: { coachTrust: 3, businessValue: -2 } },
      { label: '协商个人品牌条款', hint: '商业价值+4，争议+3', effects: { businessValue: 4, controversy: 3 } }
    ]),
    evt('cs_wrist_pain', '手腕疲劳', '连续赛事导致手腕酸痛，医疗组建议休息。', [
      { label: '带伤出战', hint: '稳定-1，热度+2', effects: { CONS: -1, fame: 2 } },
      { label: '休息一轮恢复', hint: '体力+15，粉丝-2', effects: { stamina: 15, fanSupport: -2 } }
    ]),
    evt('cs_dpi_change', '鼠标 DPI 调整', '新外设赞助商要求试用不同 DPI 设置。', [
      { label: '坚持原有设置', hint: '枪法+1，商业价值-1', effects: { AIM: 1, businessValue: -1 } },
      { label: '尝试适应新设置', hint: '反应+1，稳定-1', effects: { REFL: 1, CONS: -1 } }
    ]),
    evt('cs_jetlag', '时差问题', '跨洲赛事导致作息混乱，训练赛状态下滑。', [
      { label: '调整作息加练', hint: '体力-5，意识+1', effects: { stamina: -5, GMSN: 1 } },
      { label: '优先保证睡眠', hint: '心态+1，体力+8', effects: { MENT: 1, stamina: 8 } }
    ]),
    evt('cs_hotel_net', '酒店网络', '线下赛酒店网络不稳定，无法完成赛前跑图。', [
      { label: '去网咖加练', hint: '意识+1，体力-3', effects: { GMSN: 1, stamina: -3 } },
      { label: '全队看 demo 代替', hint: '沟通+1，协作+1', effects: { COMM: 1, TEAM: 1 } }
    ]),
    evt('cs_sponsor_deal', '代言机会', '外设品牌提供代言合同，但需佩戴指定耳机。', [
      { label: '接受代言', hint: '商业价值+6', effects: { businessValue: 6 } },
      { label: '专注比赛拒绝', hint: '心态+1，粉丝+2', effects: { MENT: 1, fanSupport: 2 } }
    ]),
    evt('cs_sticker_money', '贴纸分成', 'Major 贴纸分成到账，队内讨论如何分配。', [
      { label: '建议公开透明分配', hint: '队内氛围+4', effects: { lockerRoomTrust: 4 } },
      { label: '不参与讨论', hint: '稳定+1', effects: { CONS: 1 } }
    ]),
    evt('cs_transfer_rumor', '转会传闻', '媒体爆料你可能在赛季末离队，队友开始猜测。', [
      { label: '公开留队声明', hint: '忠诚+5，粉丝+3', effects: { loyalty: 5, fanSupport: 3 } },
      { label: '保持沉默', hint: '热度+3，争议+2', effects: { fame: 3, controversy: 2 } }
    ])
  ];

  // Generate combinatorial events to reach 80+
  const TOPICS = ['默认战术', '手枪局', '强起局', '半起局', '全起局', '残局', '换边', '加时', '死斗训练', '跑图', 'Demo 复盘', '心理辅导', '体能训练', '粉丝见面', '慈善直播', '战术板', '语音沟通', '键盘设置'];
  const CONTEXTS = ['连胜期间', '连败期间', 'Major 前', '联赛关键战', '德比战', '客场作战', '主场作战', '新补丁后', '新地图上线', '阵容磨合期'];
  for (let ti = 0; ti < TOPICS.length; ti++) {
    for (let ci = 0; ci < CONTEXTS.length; ci++) {
      if (CATALOG.length >= 100) break;
      const topic = TOPICS[ti];
      const ctx = CONTEXTS[ci];
      CATALOG.push(evt(`cs_gen_${ti}_${ci}`, `${ctx}的${topic}`, `在${ctx}，${topic}成为焦点，需要你做出决定。`, [
        { label: '积极面对', hint: '心态+1', effects: { MENT: 1 } },
        { label: '保守处理', hint: '稳定+1', effects: { CONS: 1 } },
        { label: '寻求教练帮助', hint: '教练信任+2', effects: { coachTrust: 2 } }
      ]));
    }
    if (CATALOG.length >= 100) break;
  }

  window.CS2_EVENTS = {
    catalog: CATALOG,
    triggerRate: 0.14,
    cooldown: 7,
    maxPerSeason: 7,
    firstAfterGame: 4,

    pickEvent(season, recentIds) {
      const recent = new Set(recentIds || []);
      const pool = CATALOG.filter(e => !recent.has(e.id));
      if (!pool.length) return CATALOG[Math.floor(Math.random() * CATALOG.length)];
      return pool[Math.floor(Math.random() * pool.length)];
    },

    shouldTrigger(season) {
      const log = season.eventLog || { count: 0, lastGame: -99 };
      const games = (season.games || []).length;
      if (games < this.firstAfterGame) return false;
      if (log.count >= this.maxPerSeason) return false;
      if (games - log.lastGame < this.cooldown) return false;
      if (games === this.firstAfterGame) return true;
      return Math.random() < this.triggerRate;
    }
  };
})();
