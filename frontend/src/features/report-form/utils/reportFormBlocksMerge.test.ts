import { describe, it, expect } from 'vitest';
import { mergeChangedFields, findBlock, normalizeBlocks } from './reportFormBlocks';

describe('mergeChangedFields', () => {
  it('只盖我改过的字段，服务端其它字段保持不变', () => {
    const server = { f_a: '服务端A', f_b: '服务端B' };
    const mine = { f_a: '我的A', f_b: '我的B' };
    expect(mergeChangedFields(server, mine, ['f_a'])).toEqual({ f_a: '我的A', f_b: '服务端B' });
  });

  it('我新加的字段会被写入', () => {
    expect(mergeChangedFields({ f_a: '1' }, { f_a: '1', f_new: 'x' }, ['f_new']))
      .toEqual({ f_a: '1', f_new: 'x' });
  });

  it('changedKeys 为空时完全保留服务端值', () => {
    expect(mergeChangedFields({ f_a: '1' }, { f_a: '2' }, [])).toEqual({ f_a: '1' });
  });
});

describe('findBlock', () => {
  it('按 id 取块', () => {
    const blocks = normalizeBlocks({ __blocks: [
      { id: 'b_default', version: 0, values: {} },
      { id: 'b_2', version: 3, values: { f_a: '1' } },
    ] });
    expect(findBlock(blocks, 'b_2')?.version).toBe(3);
    expect(findBlock(blocks, 'nope')).toBeUndefined();
  });
});
