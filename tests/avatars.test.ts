import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AVATAR_CHARACTERS, isValidAvatar, parseAvatar, randomAvatar } from '../src/shared/avatars.ts';
import { CHARACTERS, characterSvg, characterUrl } from '../src/shared/characters.ts';

describe('cartoon character avatars', () => {
  it('names and drawings stay in sync (same count and order, existing codes stay valid)', () => {
    expect(CHARACTERS.map((c) => c.name)).toEqual([...AVATAR_CHARACTERS]);
    expect(AVATAR_CHARACTERS.length).toBe(32);
    expect(new Set(AVATAR_CHARACTERS).size).toBe(32);
    expect(isValidAvatar('31-9')).toBe(true);
    expect(isValidAvatar('32-0')).toBe(false);
    expect(parseAvatar('0-0').name).toBe('أبو العبد');
    expect(parseAvatar('garbage').index).toBe(0);
    for (let i = 0; i < 50; i++) expect(isValidAvatar(randomAvatar())).toBe(true);
  });

  it('every character is a self-contained SVG that renders, and they all look different', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < CHARACTERS.length; i++) {
      const svg = characterSvg(i);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).not.toMatch(/<script|href=|on[a-z]+=|https?:\/\/(?!www\.w3\.org)/i); // no scripts or external refs
      const png = await sharp(Buffer.from(svg)).resize(64, 64).png().toBuffer();
      expect(png.length).toBeGreaterThan(500);
      seen.add(svg);
      expect(characterUrl(i)).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    }
    expect(seen.size).toBe(CHARACTERS.length);
  });
});
