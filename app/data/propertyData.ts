// The property types we retrieve and show. RetrieveCommand reads this list, so it is the only one.
// New mansion (010) is left out: Suumo's purchase listing endpoint answers HTTP 500 for it, and its own
// endpoint (JJ011FC001) uses a project layout our parser does not read. See TODO.md.
export const propertyTypes: Record<string, string> = {
  '040': 'Rental',
  '030': 'Land',
  '021': 'Second-hand house',
  '020': 'New house',
  '011': 'Second-hand mansion',
};

// Suumo's own name for each property type. Stored as a listing's property_type, since the search section is what says
// which type a listing is; the pills on a listing card are marketing labels, not the type.
export const propertyTypeNamesJa: Record<string, string> = {
  '040': '賃貸',
  '030': '土地',
  '021': '中古一戸建て',
  '020': '新築一戸建て',
  '011': '中古マンション',
};

// Types sold as units in a building. Their size is the unit's floor area (専有面積), stored as building_area,
// and they have no land area of their own.
export const unitPropertyTypes: ReadonlySet<string> = new Set(['011']);

// Regions and their prefectures, in retrieval order. RetrieveCommand reads this table, so it is the only one.
export const areas: Record<string, { name: string, provinces: Record<string, string> }> = {
  '010': {
    'name': 'Hokkaido',
    'provinces': {
      '01': 'Hokkaido',
    }
  },
  '020': {
    'name': 'Tohoku',
    'provinces': {
      '02': 'Aomori',
      '03': 'Iwate',
      '04': 'Miyagi',
      '05': 'Akita',
      '06': 'Yamagata',
      '07': 'Fukushima'
    }
  },
  '030': {
    'name': 'Kanto',
    'provinces': {
      '08': 'Ibaraki',
      '09': 'Tochigi',
      '10': 'Gunma',
      '11': 'Saitama',
      '12': 'Chiba',
      '13': 'Tokyo',
      '14': 'Kanagawa'
    }
  },
  '040': {
    'name': 'Hokuriku',
    'provinces': {
      '15': 'Niigata',
      '16': 'Toyama',
      '17': 'Ishikawa',
      '18': 'Fukui',
      '19': 'Yamanashi',
      '20': 'Nagano',
    }
  },
  '050': {
    'name': 'Tokai',
    'provinces': {
      '21': 'Gifu',
      '22': 'Shizuoka',
      '23': 'Aichi',
      '24': 'Mie',
    }
  },
  '060': {
    'name': 'Kansai',
    'provinces': {
      '25': 'Shiga',
      '26': 'Kyoto',
      '27': 'Osaka',
      '28': 'Hyogo',
      '29': 'Nara',
      '30': 'Wakayama'
    }
  },
  '080': {
    'name': 'Chugoku',
    'provinces': {
      '31': 'Tottori',
      '32': 'Shimane',
      '33': 'Okayama',
      '34': 'Hiroshima',
      '35': 'Yamaguchi'
    }
  },
  '070': {
    'name': 'Shikoku',
    'provinces': {
      '36': 'Tokushima',
      '37': 'Kagawa',
      '38': 'Ehime',
      '39': 'Kochi',
    }
  },
  '090': {
    'name': 'Kyushu',
    'provinces': {
      '40': 'Fukuoka',
      '41': 'Saga',
      '42': 'Nagasaki',
      '43': 'Kumamoto',
      '44': 'Oita',
      '45': 'Miyazaki',
      '46': 'Kagoshima',
      '47': 'Okinawa'
    }
  }
}; 