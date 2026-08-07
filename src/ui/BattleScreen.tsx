import { useEffect, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import type { GameState } from '../game/state/game';
import type { GameAction } from '../game/state/reducer';
import { currentFoodList } from '../game/state/game';
import { currentPlayerUnit, isTameable, tameChance, TAME_THRESHOLD } from '../game/core/battle';
import { getSkill } from '../game/data/skills';
import { getItem } from '../game/data/items';
import type { SkillDef, Unit } from '../game/types';
import { UnitCard } from './components';
import { persistSave } from './persistence';

const BATTLE_ITEM_IDS = ['atk_up', 'spd_up', 'hp_up', 'atk_down', 'spd_down', 'hp_down'];

interface Props {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}

export function BattleScreen({ state, dispatch }: Props) {
  const battle = state.battle;
  if (!battle) return null;

  const [pendingSkill, setPendingSkill] = useState<{ skillId: string; target?: string } | null>(null);
  const [pendingTame, setPendingTame] = useState<string | null>(null);
  const [pendingBattleItem, setPendingBattleItem] = useState<string | null>(null);
  const [hoverEnemy, setHoverEnemy] = useState<string | null>(null);

  const current = currentPlayerUnit(battle);
  const actorUid = current?.uid;

  useEffect(() => {
    setPendingSkill(null);
    setPendingTame(null);
    setPendingBattleItem(null);
  }, [actorUid, battle?.rngCount]);

  const skills: SkillDef[] = useMemo(() => (current ? current.skills.map((id) => getSkill(id)) : []), [current]);
  const foods = currentFoodList(state);
  const battleItems = BATTLE_ITEM_IDS
    .map((id) => getItem(id))
    .filter((it) => (state.inventory[it.id] ?? 0) > 0);

  const nodeType = state.map.layers[state.currentRow]?.find((n) => n.id === state.currentNodeId)?.type;
  const isChallenge = nodeType === 'arena' || nodeType === 'gauntlet';

  const enemyUnits = [...battle.enemyUnits].sort((a, b) => a.column - b.column);
  const playerUnits = [...battle.playerUnits].sort((a, b) => a.column - b.column);

  const validEnemyTargets = useMemo(() => {
    const targets = new Set<string>();
    if (pendingSkill) {
      const skill = getSkill(pendingSkill.skillId);
      if (skill.target === 'single') {
        enemyUnits.filter((u) => u.hp > 0).forEach((u) => targets.add(u.uid));
      }
    }
    if (pendingBattleItem) {
      const isDebuff = ['atk_down', 'spd_down', 'hp_down'].includes(pendingBattleItem);
      if (isDebuff) {
        enemyUnits.filter((u) => u.hp > 0).forEach((u) => targets.add(u.uid));
      }
    }
    return targets;
  }, [pendingSkill, pendingBattleItem, battle.rngCount, enemyUnits]);

  const validAllyTargets = useMemo(() => {
    const targets = new Set<string>();
    if (pendingSkill) {
      const skill = getSkill(pendingSkill.skillId);
      if (skill.target === 'ally') {
        battle.playerUnits.filter((u) => u.hp > 0).forEach((u) => targets.add(u.uid));
      }
    }
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      if (isBuff) {
        battle.playerUnits.filter((u) => u.hp > 0).forEach((u) => targets.add(u.uid));
      }
    }
    return targets;
  }, [pendingSkill, pendingBattleItem, battle.rngCount]);

  function onSkillClick(skill: SkillDef) {
    if (!current) return;
    if (skill.target === 'single' || skill.target === 'ally') {
      setPendingTame(null);
      setPendingSkill({ skillId: skill.id });
      return;
    }
    dispatch({ type: 'PLAYER_SKILL', skillId: skill.id });
  }

  function onTargetClick(uid: string, isEnemy: boolean) {
    if (pendingSkill) {
      dispatch({ type: 'PLAYER_SKILL', skillId: pendingSkill.skillId, targetUid: uid });
      setPendingSkill(null);
      return;
    }
    if (pendingBattleItem) {
      const isBuff = ['atk_up', 'spd_up', 'hp_up'].includes(pendingBattleItem);
      const isDebuff = ['atk_down', 'spd_down', 'hp_down'].includes(pendingBattleItem);
      // 验证目标合法性：buff只能给友方，debuff只能给敌方
      if ((isBuff && isEnemy) || (isDebuff && !isEnemy)) return;
      dispatch({ type: 'USE_BATTLE_ITEM', itemId: pendingBattleItem, targetUid: uid });
      setPendingBattleItem(null);
      return;
    }
    if (pendingTame && isEnemy) {
      dispatch({ type: 'PLAYER_TAME', foodId: pendingTame, enemyUid: uid });
      setPendingTame(null);
    }
  }

  function onFoodClick(foodId: string) {
    if (!current) return;
    setPendingSkill(null);
    setPendingTame(foodId);
  }

  function onBattleItemClick(itemId: string) {
    if (!current) return;
    setPendingSkill(null);
    setPendingTame(null);
    setPendingBattleItem(itemId);
  }

  function tameTip(u: Unit): string {
    if (!u.tameable) return '不可捕捉';
    if (u.hp / u.maxHp > TAME_THRESHOLD) return `需血量 ≤ ${Math.round(TAME_THRESHOLD * 100)}%`;
    if (u.hp === 1) return '必定捕捉！';
    if (!pendingTame) return '';
    return `捕捉概率 ${Math.round(tameChance(u, pendingTame) * 100)}%`;
  }

  const logItems = battle.log.slice(-6);

  return (
    <div className="screen">
      <div className="hud">
        <span className="act">第 {state.act} 层 · 回合 {battle.round}</span>
        <span>{current ? `轮到 ${current.name} 行动` : '战斗进行中…'}</span>
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

      <div className="battle-grid">
        <div>
          <div className="side-label">敌 方</div>
          <div className="side enemy">
            {enemyUnits.map((u) => (
              <div
                key={u.uid}
                className="enemy-slot"
                onMouseEnter={() => setHoverEnemy(u.uid)}
                onMouseLeave={() => setHoverEnemy(null)}
              >
                <UnitCard
                  unit={u}
                  className={validEnemyTargets.has(u.uid) || (pendingTame && isTameable(u)) ? 'valid-target targetable' : ''}
                  onClick={
                    validEnemyTargets.has(u.uid) || (pendingTame && isTameable(u))
                      ? () => onTargetClick(u.uid, true)
                      : undefined
                  }
                />
                {pendingTame && hoverEnemy === u.uid && <div className="tame-tip">{tameTip(u)}</div>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="side-label">我 方</div>
          <div className="side">
            {playerUnits.map((u) => (
              <UnitCard
                key={u.uid}
                unit={u}
                className={validAllyTargets.has(u.uid) ? 'valid-target targetable' : ''}
                onClick={validAllyTargets.has(u.uid) ? () => onTargetClick(u.uid, false) : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="action-panel">
        <span className="who">{current ? `${current.emoji} ${current.name}` : '—'}</span>
        {current ? (
          <>
            <div className="skills">
              {skills.map((s) => (
                <button key={s.id} onClick={() => onSkillClick(s)} title={s.desc}>
                  {s.name}
                </button>
              ))}
            </div>
            <div className="foods">
              {foods.length === 0 && <span className="card-sub">没有食物</span>}
              {foods.map((f) => {
                const count = state.inventory[f.id] ?? 0;
                return (
                  <button
                    key={f.id}
                    onClick={() => onFoodClick(f.id)}
                    disabled={count <= 0 || !battle.enemyUnits.some((u) => isTameable(u))}
                    title={`${f.desc}（拥有 ${count} 个）`}
                  >
                    {f.emoji} {f.name}×{count}
                  </button>
                );
              })}
            </div>
            <div className="foods">
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
                      title={`${it.desc}（拥有 ${count} 个）`}
                    >
                      {it.emoji} {it.name}×{count}
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <span className="card-sub">
            {battle.phase === 'won'
              ? isChallenge
                ? '挑战胜利！'
                : '战斗胜利！'
              : battle.phase === 'lost'
                ? isChallenge
                  ? '挑战失败…'
                  : '全队阵亡…'
                : '本回合结束'}
          </span>
        )}
      </div>

      <div className="log-box">
        {logItems.map((l, i) => (
          <div key={i} className={i === logItems.length - 1 ? 'recent' : ''}>
            {l}
          </div>
        ))}
      </div>

      {pendingSkill && (
        <div className="card-sub" style={{ marginTop: 6 }}>
          ⚡ {getSkill(pendingSkill.skillId).name}：请选择一个目标
        </div>
      )}
      {pendingTame && (
        <div className="card-sub" style={{ marginTop: 6 }}>
          🍖 选择血量低于 {Math.round(TAME_THRESHOLD * 100)}% 的敌人进行驯服
        </div>
      )}
      {pendingBattleItem && (
        <div className="card-sub" style={{ marginTop: 6 }}>
          🧪 {getItem(pendingBattleItem).name}：选择目标使用
        </div>
      )}

      {battle.phase === 'won' && (
        <div className="overlay">
          <div className="overlay-box">
            <div style={{ fontSize: 48 }}>🏆</div>
            <h2>{isChallenge ? '挑战胜利' : '战斗胜利'}</h2>
            <p>
              {isChallenge
                ? `驯服了 ${battle.pendingTame.length} 只宠物，获得经验与挑战奖励`
                : `驯服了 ${battle.pendingTame.length} 只宠物，获得经验与金币`}
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
