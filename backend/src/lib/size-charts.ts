// Brand size charts, v1: the body ranges each brand prints against its sizes,
// in cm. The fit service reads a member's "M in Zara" off these. Rows are
// typed constants so a brand is added by appending an entry; `approx: true`
// marks a chart taken from published ranges rather than the brand's own page.

export type Gender = 'women' | 'men' | 'unisex';
export type FitCategory = 'top' | 'bottom' | 'shoes';
/** Where the brand's sizing differs by market; 'global' where it doesn't. */
export type Region = 'global' | 'IN' | 'AE' | 'UK' | 'EU' | 'US';

/** [min, max] in cm. */
export type Span = [number, number];

export interface SizeRow {
  /** The label the member sees on the tag; for shoes, the EU size. */
  size: string;
  /** Chest for men, bust for women. */
  chest?: Span;
  waist?: Span;
  hips?: Span;
  inseam?: Span;
  /** Foot length, shoes only. */
  foot?: Span;
  eu?: string;
  uk?: string;
  us?: string;
  /** This row is from a published range, not the brand's page. */
  approx?: boolean;
}

export interface SizeChart {
  gender: Gender;
  category: FitCategory;
  region: Region;
  /** How the label reads, for the UI ("waist in inches"). */
  labels?: string;
  approx?: boolean;
  rows: SizeRow[];
}

export interface BrandEntry {
  id: string;
  name: string;
  /** Other spellings the shop reader or the member may use. */
  aliases: string[];
  source: string;
  checkedAt: string;
  charts: SizeChart[];
}

// ---- Helpers for writing rows ---------------------------------------------

/** A published point value as a band: ±d cm. */
const pm = (v: number, d = 2): Span => [v - d, v + d];
/** Waist in inches on the label → the body waist band in cm (a label covers about an inch). */
const inch = (label: number): Span => [Math.round(label * 2.54 - 1.5), Math.round(label * 2.54 + 1.5)];
/** A shoe row: EU label, foot length in cm, and the UK / US labels. */
const shoe = (eu: string, cm: number, uk: string, us: string): SizeRow => ({ size: eu, eu, uk, us, foot: [Math.round((cm - 0.3) * 10) / 10, Math.round((cm + 0.3) * 10) / 10] });
const body = (size: string, chest: Span | null, waist: Span | null, hips?: Span | null): SizeRow => ({ size, ...(chest ? { chest } : {}), ...(waist ? { waist } : {}), ...(hips ? { hips } : {}) });

const CHECKED = '2026-09-13';

// Inditex (Zara, Massimo Dutti) share one EU shoe scale; the UK/US columns differ by gender.
const INDITEX_SHOES_WOMEN: SizeRow[] = [shoe('35', 22.4, '2', '5'), shoe('36', 23.0, '3', '6'), shoe('37', 23.7, '4', '6.5'), shoe('38', 24.4, '5', '7.5'), shoe('39', 25.0, '6', '8'), shoe('40', 25.7, '7', '9'), shoe('41', 26.4, '8', '10'), shoe('42', 27.0, '9', '11')];
const INDITEX_SHOES_MEN: SizeRow[] = [shoe('39', 25.0, '5', '6'), shoe('40', 25.7, '6', '7'), shoe('41', 26.4, '7', '8'), shoe('42', 27.0, '8', '9'), shoe('43', 27.7, '9', '10'), shoe('44', 28.4, '10', '11'), shoe('45', 29.0, '11', '12'), shoe('46', 29.7, '12', '13')];

// ABFRL (Van Heusen, Allen Solly) label shirts by nominal chest in inches and trousers by waist in inches.
const ABFRL_MEN_SHIRTS: SizeRow[] = [body('38', [94, 99], null), body('39', [97, 102], null), body('40', [99, 104], null), body('42', [104, 109], null), body('44', [109, 114], null), body('46', [114, 119], null)];
const ABFRL_MEN_TROUSERS: SizeRow[] = [28, 30, 32, 34, 36, 38, 40].map((w) => body(String(w), null, inch(w), pm(Math.round(w * 2.54) + 18, 2)));
const ABFRL_WOMEN: SizeRow[] = [body('XS', [81, 84], [64, 66], [86, 89]), body('S', [86, 89], [69, 71], [91, 94]), body('M', [91, 94], [74, 76], [97, 99]), body('L', [97, 99], [79, 81], [102, 104]), body('XL', [102, 104], [84, 86], [107, 109]), body('XXL', [107, 109], [89, 91], [112, 114])];

// ---- The table ---------------------------------------------------------------

export const BRANDS: BrandEntry[] = [
  {
    id: 'zara',
    name: 'Zara',
    aliases: ['zara.com', 'zara india', 'zara uae'],
    source: 'https://www.zara.com/in/en/help/size-guide (blocked; ranges from the published chart)',
    checkedAt: CHECKED,
    charts: [
      // The body chart is the same on the IN, AE, UK and EU sites; only the label column differs.
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', [80, 84], [60, 64], [88, 92]), body('S', [84, 88], [64, 68], [92, 96]), body('M', [88, 92], [68, 72], [96, 100]), body('L', [94, 98], [74, 78], [102, 106]), body('XL', [100, 104], [80, 84], [108, 112])] },
      { gender: 'women', category: 'bottom', region: 'global', labels: 'EU', approx: true, rows: [body('32', null, pm(58), pm(86)), body('34', null, pm(62), pm(90)), body('36', null, pm(66), pm(94)), body('38', null, pm(70), pm(98)), body('40', null, pm(76), pm(104)), body('42', null, pm(82), pm(110)), body('44', null, pm(88), pm(116)), body('46', null, pm(94), pm(122))] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('XS', [84, 88], [72, 76]), body('S', [89, 93], [76, 80]), body('M', [94, 98], [80, 84]), body('L', [99, 103], [84, 88]), body('XL', [104, 108], [89, 94]), body('XXL', [109, 114], [95, 101])] },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: [body('28', null, [71, 76], [88, 91]), body('30', null, [76, 80], [92, 95]), body('32', null, [80, 84], [96, 99]), body('34', null, [84, 88], [100, 103]), body('36', null, [89, 94], [104, 107]), body('38', null, [95, 101], [108, 112]), body('40', null, [102, 106], [113, 117])] },
      { gender: 'women', category: 'shoes', region: 'global', approx: true, rows: INDITEX_SHOES_WOMEN },
      { gender: 'men', category: 'shoes', region: 'global', approx: true, rows: INDITEX_SHOES_MEN },
    ],
  },
  {
    id: 'hm',
    name: 'H&M',
    aliases: ['h&m', 'h & m', 'hm.com', 'hennes', 'h and m', 'www2.hm.com'],
    source: 'https://www2.hm.com/en_in/customer-service/sizeguide.html (timed out; ranges from the published EU chart)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', [78, 82], [62, 66], [86, 90]), body('S', [86, 90], [70, 74], [94, 98]), body('M', [94, 98], [78, 82], [102, 106]), body('L', [102, 106], [86, 90], [110, 114]), body('XL', [110, 118], [94, 102], [118, 126])] },
      { gender: 'women', category: 'bottom', region: 'global', labels: 'EU', approx: true, rows: [body('32', null, pm(62), pm(86)), body('34', null, pm(66), pm(90)), body('36', null, pm(70), pm(94)), body('38', null, pm(74), pm(98)), body('40', null, pm(78), pm(102)), body('42', null, pm(82), pm(106)), body('44', null, pm(86), pm(110)), body('46', null, pm(90), pm(114))] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('XS', [84, 88], [72, 76]), body('S', [88, 96], [76, 84]), body('M', [96, 104], [84, 92]), body('L', [104, 112], [92, 100]), body('XL', [112, 120], [100, 108]), body('XXL', [120, 128], [108, 116])] },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: [28, 30, 32, 34, 36, 38, 40].map((w) => body(String(w), null, inch(w))) },
      { gender: 'unisex', category: 'shoes', region: 'global', approx: true, rows: [shoe('36', 22.9, '3', '5'), shoe('37', 23.5, '4', '6'), shoe('38', 24.2, '5', '7'), shoe('39', 24.9, '6', '8'), shoe('40', 25.5, '7', '9'), shoe('41', 26.2, '7.5', '9.5'), shoe('42', 26.8, '8', '10'), shoe('43', 27.5, '9', '11'), shoe('44', 28.2, '10', '12'), shoe('45', 28.8, '11', '13'), shoe('46', 29.5, '12', '14')] },
    ],
  },
  {
    id: 'uniqlo',
    name: 'Uniqlo',
    aliases: ['uniqlo.com', 'uniqlo india'],
    source: 'https://www.uniqlo.com/in/en/size-chart (timed out; UK/US and Asia charts from published ranges)',
    checkedAt: CHECKED,
    charts: [
      // Two charts: the Western one on the UK/US/EU sites, and the Asia one on the India site, a full size smaller.
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', [83, 88], [61, 64], [86, 89]), body('S', [88, 93], [66, 69], [91, 94]), body('M', [93, 99], [71, 74], [96, 99]), body('L', [99, 104], [76, 79], [101, 104]), body('XL', [104, 110], [81, 84], [106, 109])] },
      { gender: 'women', category: 'top', region: 'IN', approx: true, rows: [body('XS', [73, 79], [56, 62], [81, 87]), body('S', [79, 85], [62, 68], [87, 93]), body('M', [85, 91], [68, 74], [93, 99]), body('L', [91, 97], [74, 80], [99, 105]), body('XL', [97, 103], [80, 86], [105, 111])] },
      { gender: 'women', category: 'bottom', region: 'global', approx: true, rows: [body('XS', null, [61, 64], [86, 89]), body('S', null, [66, 69], [91, 94]), body('M', null, [71, 74], [96, 99]), body('L', null, [76, 79], [101, 104]), body('XL', null, [81, 84], [106, 109])] },
      { gender: 'women', category: 'bottom', region: 'IN', approx: true, rows: [body('XS', null, [56, 62], [81, 87]), body('S', null, [62, 68], [87, 93]), body('M', null, [68, 74], [93, 99]), body('L', null, [74, 80], [99, 105]), body('XL', null, [80, 86], [105, 111])] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('XS', [81, 89], [66, 71], [81, 86]), body('S', [86, 96], [71, 76], [86, 91]), body('M', [96, 104], [76, 84], [91, 99]), body('L', [104, 112], [84, 91], [99, 107]), body('XL', [112, 119], [91, 99], [107, 114]), body('XXL', [119, 127], [99, 107], [114, 122])] },
      { gender: 'men', category: 'top', region: 'IN', approx: true, rows: [body('XS', [72, 80], [60, 68], [76, 84]), body('S', [80, 88], [68, 76], [84, 92]), body('M', [88, 96], [76, 84], [92, 100]), body('L', [96, 104], [84, 92], [100, 108]), body('XL', [104, 112], [92, 100], [108, 116]), body('XXL', [112, 120], [100, 108], [116, 124])] },
      { gender: 'men', category: 'bottom', region: 'global', approx: true, rows: [body('XS', null, [66, 71], [81, 86]), body('S', null, [71, 76], [86, 91]), body('M', null, [76, 84], [91, 99]), body('L', null, [84, 91], [99, 107]), body('XL', null, [91, 99], [107, 114]), body('XXL', null, [99, 107], [114, 122])] },
      { gender: 'men', category: 'bottom', region: 'IN', approx: true, rows: [body('XS', null, [60, 68], [76, 84]), body('S', null, [68, 76], [84, 92]), body('M', null, [76, 84], [92, 100]), body('L', null, [84, 92], [100, 108]), body('XL', null, [92, 100], [108, 116]), body('XXL', null, [100, 108], [116, 124])] },
    ],
  },
  {
    id: 'levis',
    name: "Levi's",
    aliases: ['levis', "levi's", 'levi', 'levi.com', 'levi strauss', 'levi.in'],
    source: 'https://www.levi.com/GB/en_GB/size-guide (404; ranges from the published jeans chart)',
    checkedAt: CHECKED,
    charts: [
      // Jeans are labelled by waist in inches; the inseam is a separate choice, so it says nothing here.
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: [body('28', null, [71, 74], [86, 89]), body('29', null, [74, 76], [89, 91]), body('30', null, [76, 79], [91, 94]), body('31', null, [79, 81], [94, 97]), body('32', null, [81, 84], [97, 99]), body('33', null, [84, 86], [99, 102]), body('34', null, [86, 89], [102, 104]), body('36', null, [91, 94], [107, 109]), body('38', null, [97, 99], [112, 114]), body('40', null, [102, 104], [117, 119])] },
      { gender: 'women', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: [body('24', null, [61, 64], [86, 89]), body('25', null, [64, 66], [89, 91]), body('26', null, [66, 69], [91, 94]), body('27', null, [69, 71], [94, 97]), body('28', null, [71, 74], [97, 99]), body('29', null, [74, 76], [99, 102]), body('30', null, [76, 79], [102, 104]), body('31', null, [79, 81], [104, 107]), body('32', null, [81, 84], [107, 109]), body('33', null, [84, 86], [109, 112]), body('34', null, [86, 89], [112, 114])] },
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', pm(84, 2.5), pm(66.5, 2.5), pm(91, 2.5)), body('S', pm(89, 2.5), pm(71.5, 2.5), pm(97, 2.5)), body('M', pm(94, 2.5), pm(76.5, 2.5), pm(102, 2.5)), body('L', pm(100, 2.5), pm(83, 2.5), pm(109, 2.5)), body('XL', pm(108, 2.5), pm(91, 2.5), pm(116, 2.5))] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('XS', [84, 88], [72, 76]), body('S', [88, 96], [76, 84]), body('M', [96, 104], [84, 92]), body('L', [104, 112], [92, 100]), body('XL', [112, 120], [100, 108]), body('XXL', [120, 128], [108, 116])] },
    ],
  },
  {
    id: 'nike',
    name: 'Nike',
    aliases: ['nike.com', 'nike india'],
    source: 'https://www.nike.com/size-fit/mens-tops-alpha (404; ranges from the published chart)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('XS', [80, 88], [68, 76]), body('S', [88, 96], [76, 84]), body('M', [96, 104], [84, 92]), body('L', [104, 112], [92, 100]), body('XL', [112, 124], [100, 112]), body('XXL', [124, 136], [112, 124])] },
      { gender: 'men', category: 'bottom', region: 'global', approx: true, rows: [body('XS', null, [65, 73], [80, 88]), body('S', null, [73, 81], [88, 96]), body('M', null, [81, 89], [96, 104]), body('L', null, [89, 97], [104, 112]), body('XL', null, [97, 109], [112, 120]), body('XXL', null, [109, 121], [120, 128])] },
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', [76, 83], [60, 67], [84, 91]), body('S', [83, 90], [67, 74], [91, 98]), body('M', [90, 97], [74, 81], [98, 105]), body('L', [97, 104], [81, 88], [105, 113]), body('XL', [104, 114], [88, 98], [113, 123])] },
      { gender: 'women', category: 'bottom', region: 'global', approx: true, rows: [body('XS', null, [60, 67], [84, 91]), body('S', null, [67, 74], [91, 98]), body('M', null, [74, 81], [98, 105]), body('L', null, [81, 88], [105, 113]), body('XL', null, [88, 98], [113, 123])] },
      { gender: 'men', category: 'shoes', region: 'global', approx: true, rows: [shoe('38.5', 24.0, '5.5', '6'), shoe('40', 25.0, '6', '7'), shoe('41', 26.0, '7', '8'), shoe('42.5', 27.0, '8', '9'), shoe('44', 28.0, '9', '10'), shoe('45', 29.0, '10', '11'), shoe('46', 30.0, '11', '12')] },
      { gender: 'women', category: 'shoes', region: 'global', approx: true, rows: [shoe('35.5', 22.0, '2.5', '5'), shoe('36.5', 22.9, '3.5', '6'), shoe('38', 23.8, '4.5', '7'), shoe('39', 24.6, '5.5', '8'), shoe('40.5', 25.5, '6.5', '9'), shoe('42', 26.3, '7.5', '10')] },
    ],
  },
  {
    id: 'adidas',
    name: 'Adidas',
    aliases: ['adidas.com', 'adidas.co.in', 'adidas india', 'adidas originals'],
    source: 'https://www.adidas.co.in/help/size_charts (timed out; ranges from the published EU chart)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('XS', [82, 87], [70, 75], [87, 92]), body('S', [87, 95], [75, 83], [92, 100]), body('M', [95, 103], [83, 91], [100, 108]), body('L', [103, 111], [91, 99], [108, 116]), body('XL', [111, 119], [99, 107], [116, 124]), body('XXL', [119, 127], [107, 115], [124, 132])] },
      { gender: 'men', category: 'bottom', region: 'global', approx: true, rows: [body('XS', null, [70, 75], [87, 92]), body('S', null, [75, 83], [92, 100]), body('M', null, [83, 91], [100, 108]), body('L', null, [91, 99], [108, 116]), body('XL', null, [99, 107], [116, 124]), body('XXL', null, [107, 115], [124, 132])] },
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', [76, 82], [60, 66], [84, 90]), body('S', [82, 88], [66, 72], [90, 96]), body('M', [88, 94], [72, 78], [96, 102]), body('L', [94, 102], [78, 86], [102, 110]), body('XL', [102, 110], [86, 94], [110, 118])] },
      { gender: 'women', category: 'bottom', region: 'global', approx: true, rows: [body('XS', null, [60, 66], [84, 90]), body('S', null, [66, 72], [90, 96]), body('M', null, [72, 78], [96, 102]), body('L', null, [78, 86], [102, 110]), body('XL', null, [86, 94], [110, 118])] },
      { gender: 'men', category: 'shoes', region: 'global', approx: true, rows: [shoe('40', 24.6, '6.5', '7'), shoe('41⅓', 25.5, '7.5', '8'), shoe('42⅔', 26.3, '8.5', '9'), shoe('44', 27.1, '9.5', '10'), shoe('45⅓', 28.0, '10.5', '11'), shoe('46⅔', 28.8, '11.5', '12'), shoe('48', 29.7, '12.5', '13')] },
      { gender: 'women', category: 'shoes', region: 'global', approx: true, rows: [shoe('36', 22.1, '3.5', '5'), shoe('37⅓', 22.9, '4.5', '6'), shoe('38⅔', 23.8, '5.5', '7'), shoe('40', 24.6, '6.5', '8'), shoe('41⅓', 25.5, '7.5', '9'), shoe('42⅔', 26.3, '8.5', '10')] },
    ],
  },
  {
    id: 'van-heusen',
    name: 'Van Heusen',
    aliases: ['vanheusen', 'van heusen india', 'vanheusenindia.abfrl.in', 'vanheusenindia'],
    source: 'https://vanheusenindia.abfrl.in/size-guide (script-only page; ranges from ABFRL product charts)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'men', category: 'top', region: 'global', labels: 'chest in inches', approx: true, rows: ABFRL_MEN_SHIRTS },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: ABFRL_MEN_TROUSERS },
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: ABFRL_WOMEN },
      { gender: 'women', category: 'bottom', region: 'global', approx: true, rows: ABFRL_WOMEN.map((r) => body(r.size, null, r.waist ?? null, r.hips ?? null)) },
    ],
  },
  {
    id: 'allen-solly',
    name: 'Allen Solly',
    aliases: ['allensolly', 'allen solly india', 'allensolly.abfrl.in', 'allensolly.com'],
    source: 'https://allensolly.abfrl.in/size-guide (script-only page; ranges from ABFRL product charts)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'men', category: 'top', region: 'global', labels: 'chest in inches', approx: true, rows: ABFRL_MEN_SHIRTS.filter((r) => r.size !== '39') },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: ABFRL_MEN_TROUSERS },
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: ABFRL_WOMEN.filter((r) => r.size !== 'XXL') },
      { gender: 'women', category: 'bottom', region: 'global', approx: true, rows: ABFRL_WOMEN.filter((r) => r.size !== 'XXL').map((r) => body(r.size, null, r.waist ?? null, r.hips ?? null)) },
    ],
  },
  {
    id: 'next',
    name: 'Next',
    aliases: ['next.co.uk', 'next uk', 'nextdirect', 'next direct', 'next.ae'],
    source: 'https://www.next.co.uk/sizeguides (403; ranges from the published standard-fit chart)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'women', category: 'top', region: 'global', labels: 'UK', approx: true, rows: [body('6', pm(78, 2.5), pm(61, 2.5), pm(86, 2.5)), body('8', pm(83, 2.5), pm(66, 2.5), pm(91, 2.5)), body('10', pm(88, 2.5), pm(71, 2.5), pm(96, 2.5)), body('12', pm(93, 2.5), pm(76, 2.5), pm(101, 2.5)), body('14', pm(98, 2.5), pm(81, 2.5), pm(106, 2.5)), body('16', pm(103, 2.5), pm(86, 2.5), pm(111, 2.5)), body('18', pm(110, 3.5), pm(93, 3.5), pm(118, 3.5)), body('20', pm(117, 3.5), pm(100, 3.5), pm(125, 3.5)), body('22', pm(124, 3.5), pm(107, 3.5), pm(132, 3.5))] },
      { gender: 'women', category: 'bottom', region: 'global', labels: 'UK', approx: true, rows: [body('6', null, pm(61, 2.5), pm(86, 2.5)), body('8', null, pm(66, 2.5), pm(91, 2.5)), body('10', null, pm(71, 2.5), pm(96, 2.5)), body('12', null, pm(76, 2.5), pm(101, 2.5)), body('14', null, pm(81, 2.5), pm(106, 2.5)), body('16', null, pm(86, 2.5), pm(111, 2.5)), body('18', null, pm(93, 3.5), pm(118, 3.5)), body('20', null, pm(100, 3.5), pm(125, 3.5)), body('22', null, pm(107, 3.5), pm(132, 3.5))] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('S', [91, 97], null), body('M', [99, 104], null), body('L', [107, 112], null), body('XL', [114, 119], null), body('XXL', [122, 127], null)] },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: [28, 30, 32, 34, 36, 38, 40, 42, 44].map((w) => body(String(w), null, inch(w))) },
      { gender: 'women', category: 'shoes', region: 'global', approx: true, rows: [shoe('36', 22, '3', '5'), shoe('37', 23, '4', '6'), shoe('38', 24, '5', '7'), shoe('39', 25, '6', '8'), shoe('41', 26, '7', '9'), shoe('42', 27, '8', '10')] },
      { gender: 'men', category: 'shoes', region: 'global', approx: true, rows: [shoe('39', 25, '6', '7'), shoe('41', 26, '7', '8'), shoe('42', 27, '8', '9'), shoe('43', 28, '9', '10'), shoe('44', 29, '10', '11'), shoe('46', 30, '11', '12'), shoe('47', 31, '12', '13')] },
    ],
  },
  {
    id: 'massimo-dutti',
    name: 'Massimo Dutti',
    aliases: ['massimodutti', 'massimodutti.com', 'massimo'],
    source: 'https://www.massimodutti.com/ae/size-guide (403; ranges from the published EU chart)',
    checkedAt: CHECKED,
    charts: [
      { gender: 'women', category: 'top', region: 'global', approx: true, rows: [body('XS', [80, 84], [60, 64], [86, 90]), body('S', [84, 88], [64, 68], [90, 94]), body('M', [88, 92], [68, 72], [94, 98]), body('L', [92, 96], [72, 76], [98, 102]), body('XL', [96, 100], [76, 80], [102, 106]), body('XXL', [100, 104], [80, 84], [106, 110])] },
      { gender: 'women', category: 'bottom', region: 'global', labels: 'EU', approx: true, rows: [body('34', null, [60, 64], [86, 90]), body('36', null, [64, 68], [90, 94]), body('38', null, [68, 72], [94, 98]), body('40', null, [72, 76], [98, 102]), body('42', null, [76, 80], [102, 106]), body('44', null, [80, 84], [106, 110]), body('46', null, [84, 88], [110, 114])] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('S', [92, 96], [80, 84]), body('M', [96, 100], [84, 88]), body('L', [100, 104], [88, 92]), body('XL', [104, 108], [92, 96]), body('XXL', [108, 112], [96, 100])] },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'EU', approx: true, rows: [body('38', null, pm(76)), body('40', null, pm(80)), body('42', null, pm(84)), body('44', null, pm(88)), body('46', null, pm(92)), body('48', null, pm(96))] },
      { gender: 'women', category: 'shoes', region: 'global', approx: true, rows: INDITEX_SHOES_WOMEN },
      { gender: 'men', category: 'shoes', region: 'global', approx: true, rows: INDITEX_SHOES_MEN },
    ],
  },
  {
    id: 'marks-spencer',
    name: 'Marks & Spencer',
    aliases: ['m&s', 'marks and spencer', 'marks & spencer', 'marksandspencer', 'marksandspencer.com', 'marksandspencer.in', 'm and s'],
    source: 'https://www.marksandspencer.com/us/sizeguides (women bust and waist read off the page; the rest from the published UK chart)',
    checkedAt: CHECKED,
    charts: [
      // Bust and waist came off M&S's own page (for 168 cm height); the hips column is the published one.
      { gender: 'women', category: 'top', region: 'global', labels: 'UK', rows: [body('6', pm(78, 2.5), pm(61, 2.5), pm(85, 2.5)), body('8', pm(82, 2.5), pm(65, 2.5), pm(89, 2.5)), body('10', pm(87, 2.5), pm(70, 2.5), pm(94, 2.5)), body('12', pm(92, 2.5), pm(75, 2.5), pm(99, 2.5)), body('14', pm(97, 2.5), pm(80.5, 2.5), pm(104, 2.5)), body('16', pm(102.5, 2.5), pm(86, 2.5), pm(109.5, 2.5)), body('18', pm(108, 3), pm(92, 3), pm(115, 3)), body('20', pm(114, 3), pm(98, 3), pm(121, 3)), body('22', pm(120, 3), pm(104, 3), pm(127, 3)), body('24', pm(126, 3), pm(110, 3), pm(133, 3))] },
      { gender: 'women', category: 'bottom', region: 'global', labels: 'UK', rows: [body('6', null, pm(61, 2.5), pm(85, 2.5)), body('8', null, pm(65, 2.5), pm(89, 2.5)), body('10', null, pm(70, 2.5), pm(94, 2.5)), body('12', null, pm(75, 2.5), pm(99, 2.5)), body('14', null, pm(80.5, 2.5), pm(104, 2.5)), body('16', null, pm(86, 2.5), pm(109.5, 2.5)), body('18', null, pm(92, 3), pm(115, 3)), body('20', null, pm(98, 3), pm(121, 3)), body('22', null, pm(104, 3), pm(127, 3)), body('24', null, pm(110, 3), pm(133, 3))] },
      { gender: 'men', category: 'top', region: 'global', approx: true, rows: [body('S', [89, 94], null), body('M', [97, 102], null), body('L', [104, 109], null), body('XL', [112, 117], null), body('XXL', [119, 124], null)] },
      { gender: 'men', category: 'bottom', region: 'global', labels: 'waist in inches', approx: true, rows: [30, 32, 34, 36, 38, 40, 42, 44, 46].map((w) => body(String(w), null, inch(w))) },
      { gender: 'men', category: 'shoes', region: 'global', approx: true, rows: [shoe('39.5', 24.7, '6', '7'), shoe('41', 25.5, '7', '8'), shoe('42', 26.4, '8', '9'), shoe('43', 27.2, '9', '10'), shoe('44.5', 28.0, '10', '11'), shoe('46', 28.9, '11', '12'), shoe('47', 29.7, '12', '13')] },
      { gender: 'women', category: 'shoes', region: 'global', approx: true, rows: [shoe('35.5', 22.3, '3', '5'), shoe('37', 23.1, '4', '6'), shoe('38', 23.9, '5', '7'), shoe('39.5', 24.7, '6', '8'), shoe('41', 25.5, '7', '9'), shoe('42', 26.4, '8', '10')] },
    ],
  },
];

const byId = new Map<string, BrandEntry>();
const byAlias = new Map<string, BrandEntry>();
function index(): void {
  if (byId.size) return;
  for (const b of BRANDS) {
    byId.set(b.id, b);
    byAlias.set(b.id, b);
    byAlias.set(norm(b.name), b);
    for (const a of b.aliases) byAlias.set(norm(a), b);
  }
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.(com|in|ae|co\.uk|co|uk|net)\b.*$/, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]/g, '');
}

/** A brand by id, name, alias or shop hostname ("zara.com/in" → Zara). Null when unknown. */
export function findBrand(name: string | null | undefined): BrandEntry | null {
  if (!name) return null;
  index();
  const n = norm(name);
  if (!n) return null;
  return byAlias.get(n) ?? [...byAlias.entries()].find(([k]) => n.includes(k) && k.length >= 4)?.[1] ?? null;
}

/**
 * The chart for a brand, category and gender in a region: the region's own
 * chart when the brand differs there, else the global one; a unisex ask
 * falls back to men's, and men's/women's fall back to unisex.
 */
export function chartFor(brand: string, category: FitCategory, gender: Gender, region: Region | null): SizeChart | null {
  const entry = findBrand(brand);
  if (!entry) return null;
  const pick = (g: Gender) => {
    const cands = entry.charts.filter((c) => c.category === category && c.gender === g);
    return (region ? cands.find((c) => c.region === region) : null) ?? cands.find((c) => c.region === 'global') ?? cands[0] ?? null;
  };
  const order: Gender[] = gender === 'unisex' ? ['unisex', 'men', 'women'] : [gender, 'unisex'];
  for (const g of order) {
    const c = pick(g);
    if (c) return c;
  }
  return null;
}
