import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readPropertyDetailPage } from './propertyDetailReader.server.js';

const fixture = (name: string) => readFileSync(new URL(`../utils/__fixtures__/${name}`, import.meta.url), 'utf8');

const PROJECT_URL = 'https://suumo.jp/ms/shinchiku/fukui/sc_fukui/nc_67732664/';
const OUTLINE_URL = `${PROJECT_URL}property/`;
const RESALE_URL = 'https://suumo.jp/chukoikkodate/hokkaido_/sc_sapporoshiminami/nc_21745243/';

describe('readPropertyDetailPage', () => {
  it('reads a new mansion project: facts from its outline page, photos from the project page', async () => {
    const pages: Record<string, string> = {
      [PROJECT_URL]: fixture('suumo-new-mansion-project.html'),
      [OUTLINE_URL]: fixture('suumo-new-mansion-project-outline.html'),
    };
    const fetchHtml = vi.fn(async (url: string) => pages[url] ?? Promise.reject(new Error(`unexpected ${url}`)));

    const page = await readPropertyDetailPage(PROJECT_URL, fetchHtml);

    expect(fetchHtml.mock.calls.map(([url]) => url)).toEqual([PROJECT_URL, OUTLINE_URL]);
    const fact = (label: string) => page.facts.find(f => f.label === label)?.value;
    expect(fact('構造・階建て')).toBe('RC15階建');
    expect(fact('敷地の権利形態')).toBe('所有権の共有');
    expect(fact('管理費')).toBe('1万4730円～2万6090円／月');
    expect(fact('専有面積')).toBe('50.94m2～90.25m2');
    expect(fact('所在地')).toBe('福井県福井市中央３-204（地番）');
    expect(fact('交通')).toBe(
      '(1)JR北陸新幹線・越美北線・ハピラインふくい「福井」駅徒歩10分 (2)えちぜん鉄道勝山線「福井」駅徒歩11分 (3)福井鉄道福武線「福井城址大名町」駅徒歩5分 (4)京福バス「福井銀行本店前」バス停徒歩4分',
    );
    expect(page.facts.some(f => f.value === '-')).toBe(false);
    expect(page.photos.map(photo => photo.url)).toEqual([
      'https://img01.suumo.com/jj/resizeImage?src=gazo%2Fbukken%2F040%2FN001000%2Fimg%2F64%2F67732664%2F67732664_000011.jpg&w=463&h=308',
      'https://img01.suumo.com/jj/resizeImage?src=gazo%2Fbukken%2F040%2FN001000%2Fimg%2F64%2F67732664%2F67732664_000113.jpg&w=463&h=308',
    ]);
  });

  it('keeps the project summary when the outline page has no spec table', async () => {
    const fetchHtml = vi.fn(async (url: string) =>
      url === PROJECT_URL ? fixture('suumo-new-mansion-project.html') : '<html><body></body></html>',
    );

    const page = await readPropertyDetailPage(PROJECT_URL, fetchHtml);

    expect(page.facts.map(f => f.label)).toEqual(['所在地', '交通', '総戸数', '間取り', '専有面積', '価格', '引渡可能時期']);
    expect(page.facts[0]).toEqual({ label: '所在地', value: '福井県福井市中央３-204（地番）' });
  });

  it('reads a resale listing from its own page only', async () => {
    const fetchHtml = vi.fn(async () => fixture('suumo-detail-21745243.html'));

    const page = await readPropertyDetailPage(RESALE_URL, fetchHtml);

    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(page.facts.length).toBeGreaterThan(0);
    expect(page.photos).toHaveLength(16);
  });
});
