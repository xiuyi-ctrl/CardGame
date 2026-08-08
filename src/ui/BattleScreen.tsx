import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, WheelEvent as ReactWheelEvent } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { currentFoodList } from '../game/state/game';
import {
  isTameable,
  playerHasMove,
  skillUsesLeft,
  tameChance,
  TAME_THRESHOLD,
} from '../game/core/battle';
import { getSkill } from '../game/data/skills';
import { getItem } from '../game/data/items';
import { getPassive } from '../game/data/passives';
import type { SkillDef, Unit } from '../game/types';
import { UnitCard, skillBrief, SkillTag } from './components';
import { persistSave } from './persistence';

const BATTLE_ITEM_IDS = ['atk_up', 'spd_up', 'hp_up', 'atk_down', 'spd_down', 'hp_down'];

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

/** 判断单体攻击技能能否命中该敌人（前后排保护规则） */
function enemyTargetable(skill: SkillDef, enemy: Unit, enemies: Unit[]): boolean {
  if (skill.target !== 'single') return false;
  const front = enemies.filter((u) => u.hp > 0 && u.row === 'front');
  const back = enemies.filter((u) => u.hp > 0 && u.row === 'back');
  const reach = skill.reach ?? 'front';
  if (reach === 'direct') return true;
  if (reach === 'back') return back.length > 0 ? enemy.row === 'back' : true;
  if (reach === 'pierce') return front.length > 0 ? enemy.row === 'front' : true;
  return front.length > 0 ? enemy.row === 'front' : true;
}

function EnemySkillPanel({ unit }: { unit: Unit }) {
  const passive = getPassive(unit.passive);
  return (
    <div className="enemy-skill-panel">
      <div className="enemy-skill-panel-title">
        {unit.emoji} {unit.name}
      </div>
      {passive && (
        <div className="skill-line">
          <span className="skill-head">
            <span className="skill-name">💠 {passive.name}</span>
          </span>
          <span className="skill-desc">{passive.desc}</span>
        </div>
      )}
      {unit.skills.map((sid) => (
        <SkillTag key={sid} skill={getSkill(sid)} desc />
      ))}
    </div>
  );
}

export function BattleScreen({ state, dispatch }: Props) {
  const battle = state.battle;
  if (!battle) return null;
  const b = battle;

  const [pendingSkill, setPendingSkill] = useState<{ actorUid: string; skillId: string } | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [pendingTame, setPendingTame] = useState<string | null>(null);
  const [pendingBattleItem, setPendingBattleItem] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [inspectEnemy, setInspectEnemy] = useState<string | null>(null);

  const canAct = playerHasMove(b);
  const alivePlayers = b.playerUnits.filter((u) => u.hp > 0);
  const aliveEnemies = b.enemyUnits.filter((u) => u.hp > 0);

  useEffect(() => {
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingTame(null);
    setPendingBattleItem(null);
    setInspectEnemy(null);
  }, [battle?.round, battle?.rngCount, battle?.phase]);

  // 车轮战：场上只有一只上场宠物，默认选中它，技能栏直接展示其技能（含替补轮换后自动重选）
  useEffect(() => {
    if (!battle?.gauntlet) return;
    const actable = battle.playerUnits.find((u) => u.hp > 0 && !u.acted);
    if (!actable) return;
    setSelectedUid((cur) =>
      cur && battle.playerUnits.some((u) => u.uid === cur && u.hp > 0 && !u.acted) ? cur : actable.uid,
    );
  }, [battle?.gauntlet, battle?.round, battle?.playerUnits]);

  const selected = battle.playerUnits.find((u) => u.uid === selectedUid);
  const selectedSkills: SkillDef[] = useMemo(
    () => (selected && !selected.acted && selected.hp > 0 ? selected.skills.map((id) => getSkill(id)) : []),
    [selected],
  );

  const foods = currentFoodList(state);
  const battleItems = BATTLE_ITEM_IDS.map((id) => getItem(id)).filter((it) => (state.inventory[it.id] ?? 0) > 0);

  const nodeType = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.type;
  const isChallenge = nodeType === 'arena' || nodeType === 'gauntlet';

  const validEnemyTargets = useMemo(() => {
    const targets = new Set<string>();
    if (pendingSkill) {
      const skill = getSkill(pendingSkill.skillId);
      if (skill.target === 'single') {
        aliveEnemies.forEach((u) => {
          if (enemyTargetable(skill, u, aliveEnemies)) targets.add(u.uid);
        });
      }
    }
    if (pendingBattleItem) {
      const isDebuff = ['atk_down', 'spd_down', 'hp_down'].includes(pendingBattleItem);
      if (isDebuff) aliveEnemies.forEach((u) => targets.add(u.uid));
    }
    return targets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSkill, pendingBattleItem, battle?.rngCount]);

  const validAllyTargets = useMemo(() => {
    const targets = new Set<string>();
    if (pendingSkill) {
      const skill = getSkill(pendingSkill.skillId);
      if (skill.target === 'ally') alivePlayers.forEach((u) => targets.add(u.uid));
    }
    if (swapFrom) alivePlayers.filter((u) => u.uid !== swapFrom).forEach((u) => targets.add(u.uid));
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (isBuff) alivePlayers.forEach((u) => targets.add(u.uid));
    }
    return targets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSkill, swapFrom, pendingBattleItem, battle?.rngCount]);

  function onPlayerClick(uid: string) {
    if (pendingSkill) {
      const skill = getSkill(pendingSkill.skillId);
      if (skill.target === 'ally') {
        dispatch({ type: 'PLAYER_SKILL', actorUid: pendingSkill.actorUid, skillId: pendingSkill.skillId, targetUid: uid });
        setPendingSkill(null);
      }
      return;
    }
    if (swapFrom) {
      dispatch({ type: 'PLAYER_SWAP', actorUid: swapFrom, otherUid: uid });
      setSwapFrom(null);
      return;
    }
    if (pendingTame) return;
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (isBuff) {
        dispatch({ type: 'USE_BATTLE_ITEM', itemId: pendingBattleItem, targetUid: uid });
        setPendingBattleItem(null);
      }
      return;
    }
    const u = b.playerUnits.find((x) => x.uid === uid);
    if (u && u.hp > 0 && !u.acted) setSelectedUid(selectedUid === uid ? null : uid);
  }

  function onEnemyClick(uid: string) {
    if (pendingSkill) {
      dispatch({ type: 'PLAYER_SKILL', actorUid: pendingSkill.actorUid, skillId: pendingSkill.skillId, targetUid: uid });
      setPendingSkill(null);
      return;
    }
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (!isBuff) {
        dispatch({ type: 'USE_BATTLE_ITEM', itemId: pendingBattleItem, targetUid: uid });
        setPendingBattleItem(null);
      }
      return;
    }
    if (pendingTame) {
      const enemy = b.enemyUnits.find((u) => u.uid === uid);
      if (enemy && isTameable(enemy)) {
        dispatch({ type: 'PLAYER_TAME', foodId: pendingTame, enemyUid: uid });
        setPendingTame(null);
      }
      return;
    }
    setInspectEnemy((prev) => (prev === uid ? null : uid));
  }

  function onSkillClick(skill: SkillDef) {
    if (!selected || selected.acted) return;
    if (skill.target === 'single' || skill.target === 'ally') {
      if (pendingSkill && pendingSkill.skillId === skill.id) {
        setPendingSkill(null);
        return;
      }
      setSwapFrom(null);
      setPendingTame(null);
      setPendingBattleItem(null);
      setInspectEnemy(null);
      setPendingSkill({ actorUid: selected.uid, skillId: skill.id });
      return;
    }
    dispatch({ type: 'PLAYER_SKILL', actorUid: selected.uid, skillId: skill.id });
  }

  function onFoodClick(foodId: string) {
    if (pendingTame === foodId) {
      setPendingTame(null);
      return;
    }
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingBattleItem(null);
    setInspectEnemy(null);
    setPendingTame(foodId);
  }

  function onBattleItemClick(itemId: string) {
    if (pendingBattleItem === itemId) {
      setPendingBattleItem(null);
      return;
    }
    setPendingSkill(null);
    setSwapFrom(null);
    setPendingTame(null);
    setInspectEnemy(null);
    setPendingBattleItem(itemId);
  }

  /** 网格超出 3 行时，悬停滚动（滚轮纵向滚动，隐藏滚动条） */
  function onPanelBtnsWheel(e: ReactWheelEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTop += e.deltaY;
      e.preventDefault();
    }
  }

  function tameTip(u: Unit): string {
    if (!u.tameable) return '不可捕捉';
    if (u.hp / u.maxHp > TAME_THRESHOLD) return `需血量 ≤ ${Math.round(TAME_THRESHOLD * 100)}%`;
    if (u.hp === 1) return '必定捕捉！';
    if (!pendingTame) return '';
    return `捕捉概率 ${Math.round(tameChance(u, pendingTame) * 100)}%`;
  }

  const logItems = battle.log.slice(-6);

  const enemySlot = (u: Unit | undefined, key: string, topRow: boolean) => {
    const extra = `formation-slot ${topRow ? 'slot-front' : 'slot-back'}`;
    if (!u) return <div key={key} className={`${extra} empty`}><span className="formation-empty-slot">空</span></div>;
    const isTarget = validEnemyTargets.has(u.uid) || (pendingTame && isTameable(u));
    const isInspect = !pendingSkill && !pendingBattleItem && !pendingTame && !swapFrom;
    const inspected = inspectEnemy === u.uid;
    const showTameTip = pendingTame && isTameable(u);
    return (
      <div
        key={key}
        className={`${extra} ${isTarget ? 'valid-target targetable' : ''} ${isInspect ? 'inspectable' : ''} ${inspected ? 'inspected' : ''}`}
        onClick={isTarget || isInspect ? () => onEnemyClick(u.uid) : undefined}
      >
        <UnitCard unit={u} small topStats className={isTarget ? 'valid-target targetable' : ''} />
        {showTameTip && <div className="tame-tip">{tameTip(u)}</div>}
      </div>
    );
  };

  const playerSlot = (u: Unit | undefined, key: string, topRow: boolean) => {
    const extra = `formation-slot ${topRow ? 'slot-front' : 'slot-back'}`;
    if (!u) return <div key={key} className={`${extra} empty`}><span className="formation-empty-slot">空</span></div>;
    const sel = selectedUid === u.uid;
    const clickable = validAllyTargets.has(u.uid) || (u.hp > 0 && !u.acted);
    return (
      <div
        key={key}
        className={`${extra} ${clickable ? 'valid-target targetable' : ''} ${sel ? 'selected' : ''}`}
        onClick={clickable ? () => onPlayerClick(u.uid) : undefined}
      >
        <UnitCard unit={u} small showSkills={false} topStats className={clickable || sel ? 'valid-target targetable' : ''} />
      </div>
    );
  };

  const enemyBack = [battle.enemyUnits.find((u) => u.row === 'back' && u.column === 0), battle.enemyUnits.find((u) => u.row === 'back' && u.column === 1), battle.enemyUnits.find((u) => u.row === 'back' && u.column === 2)];
  const enemyFront = [battle.enemyUnits.find((u) => u.row === 'front' && u.column === 0), battle.enemyUnits.find((u) => u.row === 'front' && u.column === 1), battle.enemyUnits.find((u) => u.row === 'front' && u.column === 2)];
  const playerFront = [battle.playerUnits.find((u) => u.row === 'front' && u.column === 0), battle.playerUnits.find((u) => u.row === 'front' && u.column === 1), battle.playerUnits.find((u) => u.row === 'front' && u.column === 2)];
  const playerBack = [battle.playerUnits.find((u) => u.row === 'back' && u.column === 0), battle.playerUnits.find((u) => u.row === 'back' && u.column === 1), battle.playerUnits.find((u) => u.row === 'back' && u.column === 2)];

  const hint = pendingSkill
    ? `⚡ ${getSkill(pendingSkill.skillId).name}：请选择目标`
    : pendingTame
      ? '🍖 选择血量低于 40% 的敌人进行驯服'
      : pendingBattleItem
        ? `🧪 ${getItem(pendingBattleItem).name}：选择目标使用`
        : swapFrom
          ? '↔ 请选择要交换位置的己方宠物'
          : selected
            ? `⚔️ ${selected.emoji} ${selected.name}：选择技能或换位`
            : canAct
              ? '点击一只未行动的己方宠物，再选择技能或换位'
              : '敌方行动中…';

  return (
    <div className="screen">
      <div className="hud">
        <span className="act">第 {state.act} 层 · 回合 {battle.round}</span>
        {battle.gauntlet && (
          <span className="chip" title="敌方轮换上阵，一只倒下另一只顶替">
            🔥 车轮战 {battle.gauntlet.current}/{battle.gauntlet.total}
          </span>
        )}
        {battle.corruptDebuff && (
          <span className="chip" title="被侵蚀区域的暗影 debuff">
            🌑 暗影侵蚀：{battle.corruptDebuff === 'spd' ? '我方速度 -10%' : '我方受到伤害 +10%'}
          </span>
        )}
        <span className="chip">
          💰 {state.gold} · 食物 {foods.reduce((s, f) => s + (state.inventory[f.id] ?? 0), 0)}
        </span>
        <button
          className="home-btn"
          onClick={() => {
            void persistSave(state);
            dispatch({ type: 'TITLE' });
          }}
        >
          🏠 返回首页
        </button>
      </div>

      <div className="battle-main">
        <div className="battle-field">
          <div className="formation-row row-front">
            {enemyBack.map((u, i) => enemySlot(u, `eb${i}`, true))}
            {inspectEnemy && (() => {
              const eu = battle.enemyUnits.find((x) => x.uid === inspectEnemy);
              return eu && eu.row === 'back' ? <EnemySkillPanel key="insp1" unit={eu} /> : null;
            })()}
          </div>
          <div className="formation-row row-back">
            {enemyFront.map((u, i) => enemySlot(u, `ef${i}`, false))}
            {inspectEnemy && (() => {
              const eu = battle.enemyUnits.find((x) => x.uid === inspectEnemy);
              return eu && eu.row === 'front' ? <EnemySkillPanel key="insp2" unit={eu} /> : null;
            })()}
          </div>
          <div className="battle-divider" />
          <div className="formation-row row-front">{playerFront.map((u, i) => playerSlot(u, `pf${i}`, true))}</div>
          <div className="formation-row row-back">{playerBack.map((u, i) => playerSlot(u, `pb${i}`, false))}</div>
        </div>

        <div className="log-panel">
          <div className="log-title">⚔️ 战斗记录</div>
          <div className="log-box">
            {logItems.map((l, i) => (
              <div key={i} className={`log-line ${l.side} ${i === logItems.length - 1 ? 'recent' : ''}`}>
                {l.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="hint-bar">
        <span className={`pending-hint ${pendingSkill || pendingTame || pendingBattleItem || swapFrom || selected || !canAct ? '' : 'idle'}`}>
          {hint}
        </span>
      </div>

      <div className="action-panel">
        <div className="capture-panel">
          <span className="panel-label">🍖 捕获</span>
          <div className="panel-btns" onWheel={onPanelBtnsWheel}>
            {foods.length === 0 && <span className="card-sub">没有食物</span>}
            {foods.map((f) => {
              const count = state.inventory[f.id] ?? 0;
              const isPending = pendingTame === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => onFoodClick(f.id)}
                  className={isPending ? 'primary' : ''}
                  disabled={count <= 0 || battle.phase !== 'acting' || !aliveEnemies.some((u) => isTameable(u))}
                  title={`${f.desc}（拥有 ${count} 个，喂食不消耗行动点）`}
                >
                  {f.emoji} {f.name}×{count}
                </button>
              );
            })}
          </div>
        </div>
        <div className="items-panel">
          <span className="panel-label">🧪 道具</span>
          <div className="panel-btns" onWheel={onPanelBtnsWheel}>
            {battleItems.length === 0 ? (
              <span className="card-sub">没有战斗道具</span>
            ) : (
              battleItems.map((it) => {
                const count = state.inventory[it.id] ?? 0;
                const isPending = pendingBattleItem === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => onBattleItemClick(it.id)}
                    className={isPending ? 'primary' : ''}
                    disabled={!canAct}
                    title={`${it.desc}（拥有 ${count} 个）`}
                  >
                    {it.emoji} {it.name}×{count}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="skill-column">
          {selected && !selected.acted ? (
            <>
              <span className="who">
                {selected.emoji} {selected.name}
                {(() => {
                  const p = selected.passive && getPassive(selected.passive);
                  return p ? (
                    <span className="who-passive" title={`被动「${p.name}」：${p.desc}`}>
                      💠{p.name}：{p.desc}
                    </span>
                  ) : null;
                })()}
              </span>
              {selectedSkills.map((s) => {
                const left = skillUsesLeft(selected, s.id);
                const limited = Number.isFinite(left);
                const exhausted = limited && left <= 0;
                return (
                  <button
                    key={s.id}
                    className="skill-btn"
                    onClick={() => onSkillClick(s)}
                    disabled={exhausted}
                    title={`${s.desc}（${skillBrief(s)}）${limited ? `，本场剩余 ${Math.max(0, left)} 次` : ''}`}
                  >
                    <span className="skill-btn-main">
                      {s.name}
                      <span className="skill-num">{skillBrief(s)}</span>
                    </span>
                    <span className="skill-desc">
                      {s.desc}
                      {limited && <span className="skill-uses">{exhausted ? '（已用完）' : `（剩 ${Math.max(0, left)} 次）`}</span>}
                    </span>
                  </button>
                );
              })}
              <button
                className="skill-btn swap-btn"
                onClick={() => {
                  setPendingSkill(null);
                  setPendingTame(null);
                  setPendingBattleItem(null);
                  setInspectEnemy(null);
                  setSwapFrom(selected.uid);
                }}
                disabled={alivePlayers.length < 2}
                title="与另一只己方宠物交换前后/左右位置（消耗 1 行动点）"
              >
                <span className="skill-btn-main">↔ 换位</span>
                <span className="skill-desc">交换位置（1 行动点）</span>
              </button>
            </>
          ) : (
            <>
              <span className="who">{selected && selected.acted ? `${selected.emoji} ${selected.name}（已行动）` : '—'}</span>
              <span className="card-sub">
                {battle.phase === 'won'
                  ? isChallenge
                    ? '挑战胜利！'
                    : '战斗胜利！'
                  : battle.phase === 'lost'
                    ? isChallenge
                      ? '挑战失败…'
                      : '全队阵亡…'
                    : canAct
                      ? '先点击一只未行动的己方宠物'
                      : '敌方行动中…'}
              </span>
            </>
          )}
        </div>
        <div className="end-panel">
          <span className="end-ap">⚡ 行动点 {battle.playerAp}/{battle.playerApMax}</span>
          <button className="primary end-turn-btn" onClick={() => dispatch({ type: 'END_TURN' })} disabled={!canAct}>
            结束回合
          </button>
        </div>
      </div>

      {battle.phase === 'won' && (
        <div className="overlay">
          <div className="overlay-box">
            <div style={{ fontSize: 48 }}>🏆</div>
            <h2>{isChallenge ? '挑战胜利' : '战斗胜利'}</h2>
            <p>
              {isChallenge
                ? `驯服了 ${battle.pendingTame.length} 只宠物，获得挑战奖励`
                : `驯服了 ${battle.pendingTame.length} 只宠物，获得金币`}
            </p>
            <button className="primary big-btn" onClick={() => dispatch({ type: 'BATTLE_END_CONFIRM' })}>
              确认收获
            </button>
          </div>
        </div>
      )}

      {battle.phase === 'lost' && (
        <div className="overlay">
          <div className="overlay-box">
            <div style={{ fontSize: 48 }}>{isChallenge ? '⚠️' : '💀'}</div>
            <h2>{isChallenge ? '挑战失败' : '全队阵亡'}</h2>
            <p>{isChallenge ? '没有宠物阵亡，但需要承受挑战失败的代价' : '阵亡的宠物永久消失，本次远征到此结束'}</p>
            {isChallenge ? (
              <button className="primary big-btn" onClick={() => dispatch({ type: 'BATTLE_END_CONFIRM' })}>
                确认承受代价
              </button>
            ) : (
              <button
                className="primary big-btn"
                onClick={() => dispatch({ type: 'RETRY', seed: Math.floor(Math.random() * 1e9) })}
              >
                重新开始
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
