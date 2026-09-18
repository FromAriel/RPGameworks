import { describe, expect, it } from 'vitest';
import { PageErrorLog } from '../../src/platform/page-errors';

describe('unattributed page error observation', () => {
  it('starts empty', () => { expect(new PageErrorLog().snapshot()).toEqual({ count: 0, last: null }); });
  it('keeps the reported rejection without declaring game failure', () => {
    const log = new PageErrorLog();
    log.record('unhandledrejection', new Error('Corruption: block checksum mismatch'));
    expect(log.snapshot().last?.message).toBe('Corruption: block checksum mismatch');
    expect(log.snapshot().count).toBe(1);
  });
  it('bounds retained data even when errors repeat', () => {
    const log = new PageErrorLog();
    for (let i = 0; i < 1000; i++) log.record('error', 'x'.repeat(900), 'y'.repeat(3000));
    const result = log.snapshot();
    expect(result.count).toBe(1000);
    expect(result.last?.message.length).toBe(800);
    expect(result.last?.source.length).toBe(2000);
  });
  it('does not retain mutable caller references', () => {
    const log = new PageErrorLog();
    const reason = new Error('original'); log.record('error', reason, 'content.js');
    reason.message = 'changed';
    const first = log.snapshot(); first.last!.message = 'modified';
    expect(log.snapshot().last?.message).toBe('original');
  });
  it('cannot be crashed by a foreign rejection object', () => {
    const log = new PageErrorLog();
    const reason = { toString: () => { throw new Error('conversion failed'); } };
    expect(() => log.record('unhandledrejection', reason)).not.toThrow();
    expect(log.snapshot().last?.message).toBe('Uninspectable error');
  });
  it('preserves literal strings for safe text rendering, not HTML', () => {
    const log = new PageErrorLog(); log.record('error', '<img onerror=alert(1)>');
    expect(log.snapshot().last?.message).toBe('<img onerror=alert(1)>');
  });
});
