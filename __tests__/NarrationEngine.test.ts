import { NarrationEngine, NarrationCategory } from '../src/services/NarrationEngine';

afterEach(() => {
  jest.restoreAllMocks();
});

const allCategories: NarrationCategory[] = [
  'LOBBY_WELCOME', 'DAY_START_PEACE', 'DAY_START_LOSS',
  'NOMINATION_TENSION', 'EXECUTION_RESOLVED', 'GAME_OVER',
];

describe('NarrationEngine.pickSaying', () => {
  it('returns a complete saying for every category', () => {
    for (const category of allCategories) {
      const saying = NarrationEngine.pickSaying(category);
      expect(saying).not.toBeNull();
      expect(saying!.tamil).toBeTruthy();
      expect(saying!.transliteration).toBeTruthy();
      expect(saying!.translation).toBeTruthy();
      expect(saying!.contextMeaning).toBeTruthy();
    }
  });
});

describe('NarrationEngine.poetFor', () => {
  it('credits Avvaiyar for an Aathichoodi saying', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // first LOBBY_WELCOME entry is Aathichoodi
    const saying = NarrationEngine.pickSaying('LOBBY_WELCOME')!;
    expect(saying.source).toBe('Aathichoodi');
    expect(NarrationEngine.poetFor(saying)).toBe('Avvaiyar');
  });

  it('credits Bharathiyar for a Puthia Aathichoodi saying', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // last LOBBY_WELCOME entry is Puthia Aathichoodi
    const saying = NarrationEngine.pickSaying('LOBBY_WELCOME')!;
    expect(saying.source).toBe('Puthia Aathichoodi');
    expect(NarrationEngine.poetFor(saying)).toBe('Bharathiyar');
  });
});

describe('NarrationEngine.scriptFor', () => {
  it('interpolates the victim name into a DAY_START_LOSS script', () => {
    expect(NarrationEngine.scriptFor('DAY_START_LOSS', 'Bob')).toContain('Bob was taken.');
  });

  it('falls back to a generic line when no victim name is given', () => {
    expect(NarrationEngine.scriptFor('DAY_START_LOSS')).toContain('A neighbor was taken.');
  });

  it('interpolates the exiled player into an EXECUTION_RESOLVED script', () => {
    expect(NarrationEngine.scriptFor('EXECUTION_RESOLVED', 'Karthik')).toContain('Karthik has been cast out.');
  });
});

describe('narration data integrity', () => {
  it('keeps the corrected வீரியம் பெருகு entry fields straight (regression, spec fix)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // last DAY_START_LOSS entry
    const saying = NarrationEngine.pickSaying('DAY_START_LOSS')!;
    expect(saying.tamil).toBe('வீரியம் பெருகு');
    expect(saying.transliteration).toBe('Veeriyam perugu');
    expect(saying.translation).toBe('Let courage multiply.');
    expect(saying.source).toBe('Puthia Aathichoodi');
  });
});
