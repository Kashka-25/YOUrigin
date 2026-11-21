import { describe, expect, it } from 'vitest';
import { feedOrder, fromDateTime, hookInPieces, moveInFeed, moveStatus, newPost, normaliseHashtags, postChecks, postForDay, startOfWeek, type Post } from './model';
import { approvedBetween, buildSchedule, fullCaption, scheduleToMarkdown } from './export';

const at = (d: string, t = '19:00') => fromDateTime(d, t) as number;

describe('post model', () => {
  it('a day in the calendar gives a new post that day’s world and placeholder time', () => {
    const tuesday = new Date(2026, 10, 24);
    const p = postForDay(tuesday);
    expect(p.world).toBe('digital-homes');
    expect(new Date(p.scheduledAt as number).getHours()).toBe(19);
    expect(postForDay(new Date(2026, 10, 27)).format).toBe('story');
  });

  it('moving forward stamps approval and posting; moving back clears them', () => {
    const p = newPost({ status: 'draft' });
    const approved = { ...p, ...moveStatus(p, 'approved', 10) };
    expect(approved.approvedAt).toBe(10);
    const posted = { ...approved, ...moveStatus(approved, 'posted', 20) };
    expect(posted).toMatchObject({ approvedAt: 10, postedAt: 20 });
    expect(moveStatus(posted, 'draft', 30)).toEqual({ status: 'draft', approvedAt: null, postedAt: null });
  });

  it('tidies hashtags', () => {
    expect(normaliseHashtags('#Healing, nervous-system #healing  home')).toEqual(['#healing', '#nervoussystem', '#home']);
    expect(normaliseHashtags(['#A#b', 'c'])).toEqual(['#a', '#b', '#c']);
  });

  it('reads local dates and times, and refuses impossible ones', () => {
    expect(new Date(at('2026-11-23', '07:05')).toString()).toBe(new Date(2026, 10, 23, 7, 5).toString());
    expect(fromDateTime('2026-02-31', '10:00')).toBeNull();
    expect(fromDateTime('soon', '10:00')).toBeNull();
    expect(startOfWeek(new Date(2026, 10, 29)).getDate()).toBe(23);
  });

  it('gently asks for a helpline on crisis posts and warns about cannabis words', () => {
    const base = { hook: '', altText: 'x', hashtags: [], status: 'draft' as const, format: 'reel' as const };
    expect(postChecks({ ...base, caption: 'On the night I thought about suicide…' }).map((c) => c.key)).toContain('helpline');
    expect(postChecks({ ...base, caption: 'On the night I thought about suicide… Samaritans 116 123' }).map((c) => c.key)).not.toContain('helpline');
    expect(postChecks({ ...base, caption: 'Garden folklore', hashtags: ['#cannabis'] }).map((c) => c.key)).toContain('cannabis');
    expect(postChecks({ ...base, caption: 'A quiet morning' })).toEqual([]);
  });

  it('notices when a quote card’s line has left its piece', () => {
    expect(hookInPieces('the  Tide comes home', ['When the tide comes home\nI listen'])).toBe(true);
    expect(hookInPieces('the tide leaves', ['When the tide comes home'])).toBe(false);
  });
});

describe('feed grid', () => {
  const feedPost = (id: string, d: string, patch: Partial<Post> = {}) => newPost({ id, scheduledAt: at(d), format: 'single-image', status: 'draft', ...patch });
  const posts = [feedPost('mon', '2026-11-23'), feedPost('tue', '2026-11-24'), feedPost('wed', '2026-11-25'), feedPost('story', '2026-11-27', { format: 'story' }), newPost({ id: 'idea' })];

  it('shows feed posts newest first and leaves out stories and unplaced ideas', () => {
    expect(feedOrder(posts).map((p) => p.id)).toEqual(['wed', 'tue', 'mon']);
  });

  it('moving a post keeps the times in place and shifts the posts between', () => {
    const feed = feedOrder(posts);
    const changes = new Map(moveInFeed(feed, 'mon', 0).map((c) => [c.id, c.scheduledAt]));
    expect(changes.get('mon')).toBe(at('2026-11-25'));
    expect(changes.get('wed')).toBe(at('2026-11-24'));
    expect(changes.get('tue')).toBe(at('2026-11-23'));
  });

  it('never moves a posted post, or another post past one', () => {
    const feed = feedOrder([feedPost('a', '2026-11-23'), feedPost('b', '2026-11-24', { status: 'posted' }), feedPost('c', '2026-11-25')]);
    expect(moveInFeed(feed, 'b', 0)).toEqual([]);
    expect(moveInFeed(feed, 'a', 0)).toEqual([]);
    expect(moveInFeed(feed, 'c', 0)).toEqual([]);
  });
});

describe('export for scheduling', () => {
  const posts = [
    newPost({ id: 'ok', status: 'approved', scheduledAt: at('2026-11-23'), caption: 'A sample caption', cta: 'Save it', hashtags: ['#home'], media: [{ kind: 'file', name: 'IMG_1.jpg' }] }),
    newPost({ id: 'draft', status: 'draft', scheduledAt: at('2026-11-23') }),
    newPost({ id: 'later', status: 'approved', scheduledAt: at('2026-12-20') }),
  ];

  it('takes only approved posts in the dates, and changes nothing', () => {
    const before = JSON.stringify(posts);
    const s = buildSchedule(posts, new Date(2026, 10, 23), new Date(2026, 10, 29), { pieces: new Map(), assets: new Map() });
    expect(s.posts.map((p) => p.id)).toEqual(['ok']);
    expect(s.posts[0]).toMatchObject({ date: '2026-11-23', time: '19:00', fullCaption: 'A sample caption\n\nSave it\n\n#home', media: [{ name: 'IMG_1.jpg', storedInYOUrigin: false }] });
    expect(JSON.stringify(posts)).toBe(before);
    expect(approvedBetween(posts, new Date(2026, 11, 20), new Date(2026, 11, 20)).map((p) => p.id)).toEqual(['later']);
    expect(scheduleToMarkdown(s)).toContain('A sample caption');
  });

  it('never exports notes to self', () => {
    const s = buildSchedule([{ ...posts[0], notes: 'private thought' }], new Date(2026, 10, 23), new Date(2026, 10, 23), { pieces: new Map(), assets: new Map() });
    expect(JSON.stringify(s)).not.toContain('private thought');
    expect(fullCaption({ caption: '', cta: '', hashtags: [] })).toBe('');
  });
});
