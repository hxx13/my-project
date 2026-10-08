import { describe, it, expect } from 'vitest';
import { normalizeBlocks, flattenFirstBlock, BLOCKS_KEY, DEFAULT_BLOCK_ID } from './reportFormBlocks';

describe('normalizeBlocks', () => {
  it('老扁平数据归一化为单块且 id 固定', () => {
    const blocks = normalizeBlocks({ f_a: '1' });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe(DEFAULT_BLOCK_ID);
    expect(blocks[0].version).toBe(0);
    expect(blocks[0].values).toEqual({ f_a: '1' });
  });

  it('字符串输入也能解析', () => {
    const blocks = normalizeBlocks('{"f_a":"1"}');
    expect(blocks[0].values).toEqual({ f_a: '1' });
  });

  it('字符串包裹的 JSON 解包一层', () => {
    const blocks = normalizeBlocks('"{\\"f_a\\":\\"1\\"}"');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].values).toEqual({ f_a: '1' });
  });

  it('空输入给出一空块', () => {
    const blocks = normalizeBlocks(undefined);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].values).toEqual({});
  });

  it('块结构原样保留 id 与版本', () => {
    const raw = { [BLOCKS_KEY]: [{ id: 'b_x', version: 7, values: { f_a: 'v' } }] };
    const blocks = normalizeBlocks(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('b_x');
    expect(blocks[0].version).toBe(7);
    expect(blocks[0].values).toEqual({ f_a: 'v' });
  });

  it('块缺 id 按序号补默认 id', () => {
    const raw = { [BLOCKS_KEY]: [{ values: {} }, { values: {} }] };
    const blocks = normalizeBlocks(raw);
    expect(blocks[0].id).toBe(DEFAULT_BLOCK_ID);
    expect(blocks[1].id).toBe(`${DEFAULT_BLOCK_ID}_1`);
  });

  it('flattenFirstBlock 还原扁平 JSON', () => {
    const blocks = normalizeBlocks({ f_a: '1' });
    expect(JSON.parse(flattenFirstBlock(blocks))).toEqual({ f_a: '1' });
  });
});
