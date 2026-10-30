import { getCreatureImage } from '../game/data/creature-art';

/** 仅保留初始伙伴的布阵直接显示规则，图片路径实时读取统一配置。 */
export function formationSprite(speciesId: string): string | undefined {
  return ['momo', 'lulu', 'fifi', 'kiki', 'mimi', 'pipi'].includes(speciesId) ? getCreatureImage(speciesId) : undefined;
}
