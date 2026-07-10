export interface TamilSaying {
  tamil: string;
  transliteration: string;
  translation: string;
  contextMeaning: string;
  source: 'Aathichoodi' | 'Konrai Vendhan' | 'Puthia Aathichoodi';
}

export type NarrationCategory =
  | 'LOBBY_WELCOME'
  | 'DAY_START_PEACE'
  | 'DAY_START_LOSS'
  | 'NOMINATION_TENSION'
  | 'EXECUTION_RESOLVED'
  | 'GAME_OVER';

/** The engine blends two poets — the narrator script must credit whichever one actually wrote the drawn saying. */
const POET_BY_SOURCE: Record<TamilSaying['source'], string> = {
  'Aathichoodi': 'Avvaiyar',
  'Konrai Vendhan': 'Avvaiyar',
  'Puthia Aathichoodi': 'Bharathiyar',
};

export class NarrationEngine {
  private static database: Record<NarrationCategory, TamilSaying[]> = {
    LOBBY_WELCOME: [
      {
        tamil: "இணக்கம் அறிந்துகொள்",
        transliteration: "Inakkam arinthukol",
        translation: "Understand and choose your companions wisely.",
        contextMeaning: "Think carefully about who you can trust before the night falls.",
        source: "Aathichoodi"
      },
      {
        tamil: "கூடிப் பிரியேல்",
        transliteration: "Koodip piriyel",
        translation: "Do not abandon your friends after uniting.",
        contextMeaning: "Unity is the town's only defense against the outlaws.",
        source: "Aathichoodi"
      },
      {
        tamil: "சுற்றத்திற்கு அழகு சூழ இருத்தல்",
        transliteration: "Sutrathirku azhagu sooza iruthal",
        translation: "The beauty of relationship is staying together.",
        contextMeaning: "A strong town stays united and discusses openly.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "நல்லாரோடு இணங்கு",
        transliteration: "Nallaarodu inangu",
        translation: "Associate with virtuous people.",
        contextMeaning: "Build alliances with those who show clean logic.",
        source: "Aathichoodi"
      },
      {
        tamil: "ஒற்றுமை வலிமையாம்",
        transliteration: "Otrumai valimaiyaam",
        translation: "Unity is strength.",
        contextMeaning: "Division and infighting only aid the Outlaws. Stick together.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "எண்ணுவது உயர்வு",
        transliteration: "Ennuvathu uyarvu",
        translation: "Think loftily / aim high.",
        contextMeaning: "Set high standards of reasoning and look for objective behavior.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "கோன்மை கொள்",
        transliteration: "Konmai kol",
        translation: "Develop leadership qualities.",
        contextMeaning: "Let the current Moderator run the round with firm neutrality.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "கூடித் தொழில் செய்",
        transliteration: "Koodith thozhil sey",
        translation: "Work cooperatively.",
        contextMeaning: "Townspeople must share ideas openly to solve the mystery.",
        source: "Puthia Aathichoodi"
      }
    ],
    DAY_START_PEACE: [
      {
        tamil: "ஒப்புரவு ஒழுகு",
        transliteration: "Oppuravu ozhugu",
        translation: "Align with community and help others.",
        contextMeaning: "The Doctor successfully guarded our home. No lives were lost.",
        source: "Aathichoodi"
      },
      {
        tamil: "நன்மையைக் கடைப்பிடி",
        transliteration: "Nanmaiyai kadaipid",
        translation: "Cling tightly to doing good.",
        contextMeaning: "Another safe morning. Let's keep our focus and do what is right.",
        source: "Aathichoodi"
      },
      {
        tamil: "பொல்லாங்கு என்பவை எல்லாம் தவிர்",
        transliteration: "Pollaangu enbavai ellaam thavir",
        translation: "Avoid all evil deeds.",
        contextMeaning: "The Outlaws struck but failed to bypass our defenses.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "தானம் அல்லது தருமம் இல்லை",
        transliteration: "Thaanam allathu tharumam illai",
        translation: "There is no charity greater than protection.",
        contextMeaning: "Our Doctor stood between the victim and the outlaws' blades.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "உடலினை உறுதிசெய்",
        transliteration: "Udalinai uruthisey",
        translation: "Make your body strong.",
        contextMeaning: "Our target survived the night, thanks to the Doctor's timely intervention.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "சாவதற்கு அஞ்சேல்",
        transliteration: "Saavatharku anjel",
        translation: "Do not fear death.",
        contextMeaning: "We survived the dark night untouched. Let us speak with confidence.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "சேர்க்கை அழியேல்",
        transliteration: "Serkkai aziyel",
        translation: "Do not destroy alliances/friendships.",
        contextMeaning: "The community holds strong. Keep protecting each other.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "நினைப்பது முடியும்",
        transliteration: "Ninaippathu mudiyum",
        translation: "What is willed can be achieved.",
        contextMeaning: "A clean night proves we can outlast the outlaws if we focus.",
        source: "Puthia Aathichoodi"
      }
    ],
    DAY_START_LOSS: [
      {
        tamil: "சினம் சுருக்கிக் கொள்",
        transliteration: "Sinam surukkik kol",
        translation: "Control and reduce your anger.",
        contextMeaning: "A fellow townsman was taken. Do not let wrath divide us.",
        source: "Aathichoodi"
      },
      {
        tamil: "தீராக் கோபம் போராய் முடியும்",
        transliteration: "Theeraa kobam poraai mudiyum",
        translation: "Unresolved anger ends in war.",
        contextMeaning: "Panic will cause the town to eat itself. Stay calm.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "ஊக்கமுடைமை ஆக்கத்திற்கு அழகு",
        transliteration: "Ookkamudaimai aakkathirku azhagu",
        translation: "Perseverance is the beauty of progress.",
        contextMeaning: "We lost a companion, but our determination to find outlaws must not falter.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "ஐயம் புகினும் செய்வன செய்",
        transliteration: "Aiyam puginum seyvana sey",
        translation: "Even in adversity, do what is right.",
        contextMeaning: "Tension is high. Do your duty to seek out truth.",
        source: "Aathichoodi"
      },
      {
        tamil: "அச்சம் தவிர்",
        transliteration: "Acham thavir",
        translation: "Avoid fear.",
        contextMeaning: "A life was lost. Do not let fear dictate your nominations today.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "ஆண்மை தவறேல்",
        transliteration: "Aanmai thavarel",
        translation: "Never lose courage.",
        contextMeaning: "Stand firm despite the outlaws' night strike.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "இளைத்தல் இகழ்ச்சி",
        transliteration: "Ilaithal igazhchi",
        translation: "To grow weary or weak is a disgrace.",
        contextMeaning: "We are down a member, but we must not tire in our pursuit of justice.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "வீரியம் பெருகு",
        transliteration: "Veeriyam perugu",
        translation: "Let courage multiply.",
        contextMeaning: "Let the loss fuel our courage, not our confusion.",
        source: "Puthia Aathichoodi"
      }
    ],
    NOMINATION_TENSION: [
      {
        tamil: "கேள்வி முயல்",
        transliteration: "Kelvi muyal",
        translation: "Strive to ask questions and learn.",
        contextMeaning: "Ask details, analyze discrepancies, and verify stories.",
        source: "Aathichoodi"
      },
      {
        tamil: "ஒருவரைப் பற்றிப் புறஞ்சொல்லேல்",
        transliteration: "Oruvaraip pattrip puranjollel",
        translation: "Do not speak ill of someone behind their back.",
        contextMeaning: "Base your cases on logical inconsistencies, not rumors.",
        source: "Aathichoodi"
      },
      {
        tamil: "பேதைமை அல்லது பெருபிணி இல்லை",
        transliteration: "Pedhaimai allathu perupini illai",
        translation: "There is no greater disease than ignorance.",
        contextMeaning: "Blind guesses will only help the outlaws win. Think carefully.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "மனம் போன போக்கெல்லாம் போக வேண்டாம்",
        transliteration: "Manam pona pokkellaam poga vendam",
        translation: "Do not follow the mind's whim blindly.",
        contextMeaning: "Avoid voting purely on a hunch. Ask for explanations.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "வல்லமை பேசல் வலிமைக்கு இழுக்கு",
        transliteration: "Vallamai pesal valimaikku izhukku",
        translation: "Boasting of one's ability reduces strength.",
        contextMeaning: "Examine defensive speeches; is it logic, or just noise?",
        source: "Konrai Vendhan"
      },
      {
        tamil: "பொறுமை கடலினும் பெரிது",
        transliteration: "Porumai kadalinum perithu",
        translation: "Patience is larger than the ocean.",
        contextMeaning: "Let the accused explain their position before drawing conclusions.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "ஐயம் தீர்",
        transliteration: "Aiyam theer",
        translation: "Resolve doubts / seek clarity.",
        contextMeaning: "If a claim sounds suspicious, challenge it. Eliminate doubts.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "சரித்திரம் தேர்ச்சி கொள்",
        transliteration: "Sarithiram therchi kol",
        translation: "Master history/lessons of the past.",
        contextMeaning: "Look back at who voted for whom in previous rounds. Patterns reveal roles.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "சிந்தனை செய்",
        transliteration: "Sinthanai sey",
        translation: "Think deeply / reflect.",
        contextMeaning: "Do not rush. Reflect on who remains silent and who drives the noise.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "கேட்டது நம்பேல்",
        transliteration: "Kettathu nambel",
        translation: "Do not believe everything you hear.",
        contextMeaning: "The Outlaws will fabricate claims. Demand logical consistency.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "பொய்ம்மை இகழ்",
        transliteration: "Poimmai igazh",
        translation: "Despise falsehood.",
        contextMeaning: "Call out contradictory statements immediately.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "நேர்கொண்ட பார்வை",
        transliteration: "Neerkonda paarvai",
        translation: "Maintain an upright, direct gaze.",
        contextMeaning: "Observe who is avoiding direct eye contact or shifting focus.",
        source: "Puthia Aathichoodi"
      }
    ],
    EXECUTION_RESOLVED: [
      {
        tamil: "நுண்ணிய கருமமும் எண்ணித் துணி",
        transliteration: "Nunniya karumamum ennith thuni",
        translation: "Perform even minor tasks after thinking carefully.",
        contextMeaning: "A vote has cast out a player. Let's hope the decision was correct.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "நேர்பட ஒழுகு",
        transliteration: "Neerpada ozhugu",
        translation: "Walk upright with honesty.",
        contextMeaning: "An Outlaw has been exposed. Truth has cut through the web of lies.",
        source: "Aathichoodi"
      },
      {
        tamil: "வஞ்சகம் பேசேல்",
        transliteration: "Vanjagam pesel",
        translation: "Do not speak with double standards or deceit.",
        contextMeaning: "The town has silenced a source of division.",
        source: "Aathichoodi"
      },
      {
        tamil: "குற்றமுள்ள நெஞ்சு குறுகுறுக்கும்",
        transliteration: "Kuttramulla nenju kurukurukkum",
        translation: "A guilty conscience will keep prickling.",
        contextMeaning: "The suspect's nervousness was their undoing. The guilty party is exiled.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "நையப்புடை",
        transliteration: "Naiyappudai",
        translation: "Strike down evil/oppression forcefully.",
        contextMeaning: "The town votes out an Outlaw. Cruelty is banished.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "செய்வது துணிந்து செய்",
        transliteration: "Seyvathu thuninthu sey",
        translation: "Do what you do with courage.",
        contextMeaning: "The decision was tough, but the town voted with conviction.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "தீயோர்க்கு அஞ்சேல்",
        transliteration: "Theeyorkku anjel",
        translation: "Do not fear the wicked.",
        contextMeaning: "The town stands firm, exiling a threat without hesitation.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "கொடுமை எதிர்த்து நில்",
        transliteration: "Kodumaiyai ethirthu nil",
        translation: "Stand firm against cruelty.",
        contextMeaning: "Exiling the suspect is how we protect the innocent from further harm.",
        source: "Puthia Aathichoodi"
      }
    ],
    GAME_OVER: [
      {
        tamil: "மெய்யென்ற சொல் அல்லது மந்திரம் இல்லை",
        transliteration: "Meiyendra sol allathu manthiram illai",
        translation: "There is no mantra greater than truth.",
        contextMeaning: "The outlaws are gone. The Town square returns to peace.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "வஞ்சனை நெஞ்சிற்கு வளம் இல்லை",
        transliteration: "Vanjanai nenjirku valam illai",
        translation: "A deceitful heart has no prosperity.",
        contextMeaning: "Lies fall apart. The Town wins.",
        source: "Konrai Vendhan"
      },
      {
        tamil: "அறம் செய்ய விரும்பு",
        transliteration: "Aram seyya virumbu",
        translation: "Aspire to do righteous deeds.",
        contextMeaning: "The Outlaws have taken control. Righteousness was abandoned.",
        source: "Aathichoodi"
      },
      {
        tamil: "வெற்றி கொள்",
        transliteration: "Vetri kol",
        translation: "Conquer and win.",
        contextMeaning: "Complete victory. The community has purged the threat.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "வலிமை கொள்",
        transliteration: "Valimai kol",
        translation: "Be strong.",
        contextMeaning: "The town survives through strength of unity and clear analysis.",
        source: "Puthia Aathichoodi"
      },
      {
        tamil: "தேசத்தைக் காப்பாய்",
        transliteration: "Dhesathai kaappaay",
        translation: "Protect your nation/community.",
        contextMeaning: "The game concludes. The public space remains secure.",
        source: "Puthia Aathichoodi"
      }
    ]
  };

  /** Randomly draws one saying for the category — used by the narration card UI. */
  public static pickSaying(category: NarrationCategory): TamilSaying | null {
    const list = this.database[category];
    if (!list || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  /** The poet to credit for a drawn saying. */
  public static poetFor(saying: TamilSaying): string {
    return POET_BY_SOURCE[saying.source];
  }

  /** The category-specific narrator line, with the victim/suspect name woven in. */
  public static scriptFor(category: NarrationCategory, victimName?: string): string {
    switch (category) {
      case 'LOBBY_WELCOME':
        return "Gather round, everyone. We are preparing to secure our square.";
      case 'DAY_START_PEACE':
        return "The shadows struck, but our community stood guard. No casualties.";
      case 'DAY_START_LOSS':
        return `${victimName || 'A neighbor'} was taken. We must find the outlaws without letting anger blind us.`;
      case 'NOMINATION_TENSION':
        return "Tensions rise. Let us debate, ask questions, and seek proof.";
      case 'EXECUTION_RESOLVED':
        return `${victimName || 'The suspect'} has been cast out. Let's see if our judgment was true.`;
      case 'GAME_OVER':
        return "The struggle has ended. The final cards are laid bare.";
    }
  }
}
