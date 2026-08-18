/**
 * 串行化异步任务队列 —— 全量替换写回的标准件。
 *
 * 场景：服务端购物车是全量替换 PUT，并发提交会互相覆盖（后到者覆盖先到者，
 * 若先到者持旧快照则丢物品）。把写回放入本队列后，同时只有一个任务在飞，
 * 任务按入队顺序执行，最终落库态总是最后一个任务的状态。
 */

export type AsyncTask<T = unknown> = () => Promise<T> | T;

export interface SerializedQueue {
  /** 入队并执行（串行）。返回本次任务的结果 promise，调用方可 await / 观察错误。 */
  run: <T>(task: AsyncTask<T>) => Promise<T>;
}

/**
 * 创建一个串行队列。
 * - 任务按入队顺序逐个执行，绝不并发；
 * - 前一个任务失败不会阻断后续任务（tail 吞掉错误后继续）；
 * - 与 Promise.resolve() 初始链相同：入队的第一个任务在下一个微任务执行。
 */
export function createSerializedQueue(): SerializedQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: AsyncTask<T>): Promise<T> {
      const result = tail.catch(() => {}).then(task);
      tail = result;
      return result;
    },
  };
}
