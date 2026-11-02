import JSZip from 'jszip';
import type { Asset, Book, BookDesign, BookEntry, ContentItem, Section } from '../domain/types';
import { displayTitle } from '../domain/text';
import { BODY_FONTS, MARGINS, TRIMS } from '../print/design';
import { orderedBook } from './export';

/**
 * Publishing exports: a Word manuscript (.docx) for editors, agents and publishers,
 * and an EPUB for ebook stores. Both follow the book's order and its front and back
 * pages from Design & print. Writing space (journal lines) belongs to print only.
 */
export interface PublishInput {
  book: Book;
  design: BookDesign;
  sections: Section[];
  entries: BookEntry[];
  contentById: Map<string, ContentItem>;
  assets: Map<string, Asset>;
}

/** An image ready for formats that only take JPEG/PNG. */
export type PortableImage = { data: Uint8Array; mime: 'image/jpeg' | 'image/png'; ext: 'jpg' | 'png'; width: number; height: number };
export type ImageConverter = (a: Asset) => Promise<PortableImage>;

// ---------- shared ----------

/** Adds a file without separate folder entries, which some checkers flag. */
const put = (zip: JSZip, path: string, data: string | Uint8Array, opts: JSZip.JSZipFileOptions = {}) => {
  zip.file(path, data, { createFolders: false, ...opts });
};

// XML 1.0 forbids most control characters; strip them before escaping.
// eslint-disable-next-line no-control-regex
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
export const xml = (s: string) => clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The heading a piece gets in the book; untitled poems stand without one, as in print. */
export function pieceHeading(c: ContentItem): string {
  if (c.type === 'image') return c.title.trim();
  return c.title.trim() || (c.type === 'poem' ? '' : displayTitle(c));
}

/** Poems and fragments keep every line break; prose turns each line into a paragraph. */
export function paragraphs(c: ContentItem): string[][] {
  const blocks = c.body.replace(/\r\n?/g, '\n').trim().split(/\n\s*\n+/).filter((b) => b.trim());
  const lineBroken = c.type === 'poem' || c.type === 'fragment';
  return lineBroken ? blocks.map((b) => b.split('\n')) : blocks.flatMap((b) => b.split('\n').filter((l) => l.trim()).map((l) => [l]));
}

function chapters(input: PublishInput) {
  return orderedBook(input.sections, input.entries, input.contentById)
    .map(({ section, items }) => ({ section, items: items.filter((c) => c.type !== 'image' || c.assetId) }))
    .filter((g) => g.items.length || g.section.imageAssetId);
}

function decodeDataUrl(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Keeps JPEG/PNG as they are; anything else (the app stores WebP) becomes a JPEG on white. */
export const browserImageConverter: ImageConverter = async (a) => {
  if (a.mime === 'image/jpeg' || a.mime === 'image/png')
    return { data: decodeDataUrl(a.dataUrl), mime: a.mime, ext: a.mime === 'image/png' ? 'png' : 'jpg', width: a.width, height: a.height };
  const img = new Image();
  img.src = a.dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error(`Couldn’t convert ${a.name}`))), 'image/jpeg', 0.9));
  return { data: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', ext: 'jpg', width: canvas.width, height: canvas.height };
};

/** Converts each image the book uses once, numbered in reading order. */
async function collectImages(input: PublishInput, convert: ImageConverter, ids: (string | undefined)[]) {
  const out = new Map<string, PortableImage & { n: number }>();
  for (const id of ids) {
    const a = id ? input.assets.get(id) : undefined;
    if (!a || out.has(a.id)) continue;
    out.set(a.id, { ...(await convert(a)), n: out.size + 1 });
  }
  return out;
}

const imageIds = (input: PublishInput, withCover: boolean) => [
  ...(withCover ? [input.book.coverAssetId] : []),
  ...chapters(input).flatMap((g) => [g.section.imageAssetId, ...g.items.map((c) => (c.type === 'image' ? c.assetId : undefined))]),
];

// ---------- Word (.docx) ----------

const EMU = 914400; // per inch

function run(text: string, props = ''): string {
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}

function para(content: string, { style, align, breakBefore, keepNext }: { style?: string; align?: string; breakBefore?: boolean; keepNext?: boolean } = {}): string {
  const pPr = [style && `<w:pStyle w:val="${style}"/>`, keepNext && '<w:keepNext/>', breakBefore && '<w:pageBreakBefore/>', align && `<w:jc w:val="${align}"/>`].filter(Boolean).join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
}

/** Lines joined with soft line breaks inside one paragraph. */
const lines = (ls: string[], props = '') => ls.map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, props)).join('');

function docxImage(img: PortableImage & { n: number }, rid: string, maxW: number, maxH: number): string {
  // Inches per pixel: as large as the text block allows, but no larger than 150dpi.
  const perPx = Math.min(maxW / img.width, maxH / img.height, 1 / 150);
  const w = Math.round(img.width * perPx * EMU);
  const h = Math.round(img.height * perPx * EMU);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${img.n}" name="Image ${img.n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${img.n}" name="image${img.n}.${img.ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

export async function bookToDocx(input: PublishInput, convert: ImageConverter = browserImageConverter): Promise<Blob> {
  const { book, design: d } = input;
  const trim = TRIMS[d.trim];
  const inch = (v: number) => (trim.unit === 'mm' ? v / 25.4 : v);
  const m = MARGINS[d.margins];
  const tw = (v: number) => Math.round(v * 1440); // twentieths of a point
  const textW = inch(trim.w) - m.inner - m.outer;
  const textH = inch(trim.h) - m.top - m.bottom;
  const images = await collectImages(input, convert, imageIds(input, true));
  const rid = (id: string) => `rIdImg${images.get(id)!.n}`;
  const picture = (id: string | undefined, align = 'center') => {
    const img = id ? images.get(id) : undefined;
    return img ? para(docxImage(img, rid(id!), textW, textH * 0.9), { align }) : '';
  };
  const poemAlign = d.poemAlign === 'center' ? 'center' : undefined;
  const titleAlign = d.titleAlign === 'center' ? 'center' : undefined;
  const body: string[] = [];
  let first = true;
  const page = () => {
    const b = !first;
    first = false;
    return b;
  };

  if (book.coverAssetId && images.has(book.coverAssetId)) {
    page();
    body.push(picture(book.coverAssetId));
  }
  body.push(para(run(book.title), { style: 'Title', align: 'center', breakBefore: page() }));
  if (book.subtitle) body.push(para(run(book.subtitle), { style: 'Subtitle', align: 'center' }));
  if (d.author) body.push(para(run(d.author), { style: 'Author', align: 'center' }));
  if (d.copyright.trim()) body.push(para(lines(d.copyright.trim().split('\n')), { style: 'Copyright', breakBefore: page() }));
  if (d.dedication.trim()) body.push(para(lines(d.dedication.trim().split('\n'), '<w:i/>'), { style: 'Dedication', align: 'center', breakBefore: page() }));
  const acks = () => {
    body.push(para(run('Acknowledgements'), { style: 'Heading1', breakBefore: page() }));
    for (const p of d.acknowledgements.trim().split(/\n\s*\n+/)) body.push(para(lines(p.split('\n'))));
  };
  if (d.acknowledgements.trim() && d.acknowledgementsAt === 'front') acks();
  const groups = chapters(input);
  if (d.toc && groups.length > 1) {
    body.push(para(run('Contents'), { style: 'TOCHeading', breakBefore: page() }));
    // Word fills this in when the document opens (updateFields in settings.xml).
    body.push(
      `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-1" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('Update this field to fill in the contents (right-click → Update field).', '<w:i/>')}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`,
    );
  }
  for (const { section, items } of groups) {
    body.push(para(run(section.title), { style: 'Heading1', breakBefore: page() }));
    if (section.imageAssetId) body.push(picture(section.imageAssetId));
    items.forEach((c, i) => {
      const newPage = i > 0 && d.pieceOnNewPage;
      if (i > 0 && !d.pieceOnNewPage && d.ornament) body.push(para(run(d.ornament), { style: 'Ornament', align: 'center' }));
      const heading = pieceHeading(c);
      if (c.type === 'image') {
        if (heading) body.push(para(run(heading), { style: 'Heading2', align: titleAlign, breakBefore: newPage, keepNext: true }));
        const pic = picture(c.assetId);
        body.push(heading || !newPage ? pic : pic.replace('<w:pPr>', '<w:pPr><w:pageBreakBefore/>'));
        if (c.body.trim()) body.push(para(lines(c.body.trim().split('\n'), '<w:i/>'), { style: 'Caption', align: 'center' }));
        return;
      }
      let breakNext = newPage;
      if (heading) {
        body.push(para(run(heading), { style: 'Heading2', align: titleAlign, breakBefore: breakNext, keepNext: true }));
        breakNext = false;
      }
      const lineBroken = c.type === 'poem' || c.type === 'fragment';
      for (const p of paragraphs(c)) {
        body.push(para(lines(p), { style: lineBroken ? 'Poem' : undefined, align: lineBroken ? poemAlign : undefined, breakBefore: breakNext }));
        breakNext = false;
      }
    });
  }
  if (!groups.length) body.push(para(run('This book has no placed pieces yet.'), { breakBefore: page() }));
  if (d.acknowledgements.trim() && d.acknowledgementsAt === 'back') acks();

  const sectPr = `<w:sectPr><w:pgSz w:w="${tw(inch(trim.w))}" w:h="${tw(inch(trim.h))}"/><w:pgMar w:top="${tw(m.top)}" w:right="${tw(m.outer)}" w:bottom="${tw(m.bottom)}" w:left="${tw(m.inner)}" w:header="${tw(m.top / 2)}" w:footer="${tw(m.bottom / 2)}" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}${sectPr}</w:body></w:document>`;

  const font = BODY_FONTS[d.bodyFont].css.split(',')[0].replace(/'/g, '').replace(/ Variable$/, '');
  const heading = d.headingFont === 'cinzel' ? 'Cinzel' : font;
  const half = Math.round(d.fontSize * 2);
  const line = Math.round(d.lineHeight * 240);
  const style = (id: string, name: string, pPr: string, rPr: string, extra = '') =>
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${pPr}</w:pPr><w:rPr>${rPr}</w:rPr></w:style>`;
  const hf = `<w:rFonts w:ascii="${heading}" w:hAnsi="${heading}" w:cs="${heading}"/>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${half}"/><w:szCs w:val="${half}"/><w:lang w:val="${xml(lang())}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${style('Title', 'Title', '<w:spacing w:before="2400" w:after="240"/><w:jc w:val="center"/>', `${hf}<w:sz w:val="${half * 3}"/>`)}
${style('Subtitle', 'Subtitle', '<w:jc w:val="center"/><w:spacing w:after="480"/>', `<w:i/><w:sz w:val="${Math.round(half * 1.4)}"/>`)}
${style('Author', 'Author', '<w:jc w:val="center"/><w:spacing w:before="960"/>', `${hf}<w:sz w:val="${Math.round(half * 1.2)}"/>`)}
${style('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:before="1440" w:after="480"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>', `${hf}<w:caps/><w:spacing w:val="40"/><w:sz w:val="${Math.round(half * 1.6)}"/>`)}
${style('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="360" w:after="200"/><w:outlineLvl w:val="1"/>', `<w:i/><w:sz w:val="${Math.round(half * 1.2)}"/>`)}
${style('TOCHeading', 'TOC Heading', '<w:spacing w:before="1440" w:after="480"/><w:jc w:val="center"/>', `${hf}<w:caps/><w:sz w:val="${Math.round(half * 1.4)}"/>`)}
${style('Poem', 'Poem', '<w:spacing w:after="240"/>', '')}
${style('Ornament', 'Ornament', '<w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/>', '')}
${style('Caption', 'caption', '<w:jc w:val="center"/>', `<w:i/><w:sz w:val="${Math.round(half * 0.9)}"/>`)}
${style('Copyright', 'Copyright', '<w:spacing w:before="4800"/>', `<w:sz w:val="${Math.round(half * 0.8)}"/>`)}
${style('Dedication', 'Dedication', '<w:spacing w:before="2400"/><w:jc w:val="center"/>', '')}
</w:styles>`;

  const zip = new JSZip();
  const imgs = [...images.values()];
  put(zip, 
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  put(zip, 
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  put(zip, 
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(book.title)}</dc:title>${d.author ? `<dc:creator>${xml(d.author)}</dc:creator>` : ''}<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:modified></cp:coreProperties>`,
  );
  put(zip, 'word/document.xml', document);
  put(zip, 'word/styles.xml', styles);
  put(zip, 
    'word/settings.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:mirrorMargins/>${d.toc && groups.length > 1 ? '<w:updateFields w:val="true"/>' : ''}</w:settings>`,
  );
  put(zip, 
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${imgs
      .map((i) => `<Relationship Id="rIdImg${i.n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i.n}.${i.ext}"/>`)
      .join('')}</Relationships>`,
  );
  for (const i of imgs) put(zip, `word/media/image${i.n}.${i.ext}`, i.data);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

// ---------- EPUB ----------

function lang(): string {
  return (typeof navigator !== 'undefined' && navigator.language) || 'en';
}

const page = (title: string, body: string, bodyClass = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(lang())}" lang="${xml(lang())}">
<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
</body>
</html>`;

const brLines = (ls: string[]) => ls.map(xml).join('<br/>');

export async function bookToEpub(input: PublishInput, convert: ImageConverter = browserImageConverter): Promise<Blob> {
  const { book, design: d } = input;
  const images = await collectImages(input, convert, imageIds(input, true));
  const src = (id: string) => {
    const i = images.get(id)!;
    return `../images/image${i.n}.${i.ext}`;
  };
  const groups = chapters(input);
  const docs: { id: string; file: string; title: string; html: string; landmark?: string }[] = [];

  const cover = book.coverAssetId && images.get(book.coverAssetId);
  if (cover)
    docs.push({
      id: 'cover',
      file: 'cover.xhtml',
      title: 'Cover',
      landmark: 'cover',
      html: page('Cover', `<section epub:type="cover" class="cover"><img src="${src(book.coverAssetId!)}" alt="${xml(`Cover of ${book.title}`)}"/></section>`),
    });
  docs.push({
    id: 'titlepage',
    file: 'titlepage.xhtml',
    title: book.title,
    landmark: 'titlepage',
    html: page(
      book.title,
      `<section epub:type="titlepage" class="titlepage"><h1 class="book-title">${xml(book.title)}</h1>${book.subtitle ? `<p class="subtitle">${xml(book.subtitle)}</p>` : ''}${
        d.author ? `<p class="author">${xml(d.author)}</p>` : ''
      }</section>`,
    ),
  });
  if (d.copyright.trim())
    docs.push({
      id: 'copyright',
      file: 'copyright.xhtml',
      title: 'Copyright',
      html: page('Copyright', `<section epub:type="copyright-page" class="copyright"><p>${brLines(d.copyright.trim().split('\n'))}</p></section>`),
    });
  if (d.dedication.trim())
    docs.push({
      id: 'dedication',
      file: 'dedication.xhtml',
      title: 'Dedication',
      html: page('Dedication', `<section epub:type="dedication" class="dedication"><p>${brLines(d.dedication.trim().split('\n'))}</p></section>`),
    });
  const acks = () =>
    docs.push({
      id: 'acknowledgements',
      file: 'acknowledgements.xhtml',
      title: 'Acknowledgements',
      html: page(
        'Acknowledgements',
        `<section epub:type="acknowledgments"><h2 class="chapter-title">Acknowledgements</h2>${d.acknowledgements
          .trim()
          .split(/\n\s*\n+/)
          .map((p) => `<p>${brLines(p.split('\n'))}</p>`)
          .join('')}</section>`,
      ),
    });
  if (d.acknowledgements.trim() && d.acknowledgementsAt === 'front') acks();

  groups.forEach(({ section, items }, gi) => {
    const parts = items.map((c, i) => {
      const sep = i > 0 && !d.pieceOnNewPage && d.ornament ? `<p class="ornament" aria-hidden="true">${xml(d.ornament)}</p>` : '';
      const heading = pieceHeading(c);
      const cls = i > 0 && d.pieceOnNewPage ? ' new-page' : '';
      if (c.type === 'image')
        return `${sep}<figure class="figure${cls}">${heading ? `<h3 class="piece-title">${xml(heading)}</h3>` : ''}<img src="${src(c.assetId!)}" alt="${xml(heading || c.body.trim() || 'Artwork')}"/>${
          c.body.trim() ? `<figcaption>${brLines(c.body.trim().split('\n'))}</figcaption>` : ''
        }</figure>`;
      const lineBroken = c.type === 'poem' || c.type === 'fragment';
      const paras = paragraphs(c)
        .map((p) => `<p${lineBroken ? ' class="poem"' : ''}>${brLines(p)}</p>`)
        .join('');
      return `${sep}<section class="piece piece-${c.type}${cls}">${heading ? `<h3 class="piece-title">${xml(heading)}</h3>` : ''}${paras}</section>`;
    });
    docs.push({
      id: `chapter${gi + 1}`,
      file: `chapter${gi + 1}.xhtml`,
      title: section.title,
      landmark: gi === 0 ? 'bodymatter' : undefined,
      html: page(
        section.title,
        `<section epub:type="chapter" class="chapter">${section.imageAssetId && images.has(section.imageAssetId) ? `<img class="opener" src="${src(section.imageAssetId)}" alt=""/>` : ''}${
          d.sectionStyle === 'ornamental' ? `<p class="ornament" aria-hidden="true">${xml(d.ornament || '✦')}</p>` : ''
        }<h2 class="chapter-title">${xml(section.title)}</h2>${parts.join('\n')}</section>`,
      ),
    });
  });
  if (d.acknowledgements.trim() && d.acknowledgementsAt === 'back') acks();

  // A book with nothing placed yet still needs one contents entry: its title page.
  const bodyDocs = docs.filter((x) => x.id.startsWith('chapter') || x.id === 'acknowledgements');
  const tocDocs = bodyDocs.length ? bodyDocs : docs.filter((x) => x.id === 'titlepage');
  // Show the contents page in the reading order only when the book asks for one.
  const tocInSpine = d.toc && groups.length > 1;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(lang())}" lang="${xml(lang())}">
<head><meta charset="UTF-8"/><title>Contents</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h2 class="chapter-title">Contents</h2><ol>${tocDocs.map((x) => `<li><a href="text/${x.file}">${xml(x.title)}</a></li>`).join('')}</ol></nav>
<nav epub:type="landmarks" hidden=""><ol>${docs
    .filter((x) => x.landmark)
    .map((x) => `<li><a epub:type="${x.landmark}" href="text/${x.file}">${xml(x.title)}</a></li>`)
    .join('')}${tocInSpine ? '<li><a epub:type="toc" href="nav.xhtml">Contents</a></li>' : ''}</ol></nav>
</body>
</html>`;
  // Books have UUIDs; anything else still gets a stable identifier, just not a urn:uuid one.
  const uid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(book.id) ? `urn:uuid:${book.id}` : `yourigin:book:${book.id}`;
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${uid}"/></head><docTitle><text>${xml(book.title)}</text></docTitle><navMap>${tocDocs
    .map((x, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xml(x.title)}</text></navLabel><content src="text/${x.file}"/></navPoint>`)
    .join('')}</navMap></ncx>`;
  const firstBody = bodyDocs.length ? docs.indexOf(bodyDocs[0]) : -1;
  const spine = docs.map((x) => `<itemref idref="${x.id}"${x.id === 'cover' ? ' linear="no"' : ''}/>`);
  if (tocInSpine) spine.splice(firstBody < 0 ? spine.length : firstBody, 0, '<itemref idref="nav"/>');
  const imgs = [...images.entries()];
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${xml(lang())}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${uid}</dc:identifier>
<dc:title>${xml(book.title)}</dc:title>
<dc:language>${xml(lang())}</dc:language>
${d.author ? `<dc:creator>${xml(d.author)}</dc:creator>` : ''}
${book.description ? `<dc:description>${xml(book.description)}</dc:description>` : ''}
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
${cover ? `<meta name="cover" content="image${cover.n}"/>` : ''}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${docs.map((x) => `<item id="${x.id}" href="text/${x.file}" media-type="application/xhtml+xml"/>`).join('\n')}
${imgs.map(([id, i]) => `<item id="image${i.n}" href="images/image${i.n}.${i.ext}" media-type="${i.mime}"${id === book.coverAssetId ? ' properties="cover-image"' : ''}/>`).join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>`;

  const zip = new JSZip();
  // The mimetype comes first and uncompressed, as the EPUB container requires.
  put(zip, 'mimetype', 'application/epub+zip', { compression: 'STORE' });
  put(zip, 
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  put(zip, 'OEBPS/content.opf', opf);
  put(zip, 'OEBPS/nav.xhtml', nav);
  put(zip, 'OEBPS/toc.ncx', ncx);
  put(zip, 'OEBPS/style.css', epubCss(d));
  for (const x of docs) put(zip, `OEBPS/text/${x.file}`, x.html);
  for (const [, i] of imgs) put(zip, `OEBPS/images/image${i.n}.${i.ext}`, i.data);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
}

/** Light styling: e-readers let the reader choose the font and size, so this only shapes the page. */
function epubCss(d: BookDesign): string {
  const center = (on: boolean) => (on ? 'center' : 'left');
  return `body { margin: 0 5%; line-height: ${d.lineHeight}; }
h1, h2, h3 { font-weight: normal; page-break-after: avoid; break-after: avoid; }
.titlepage, .dedication { text-align: center; margin-top: 30%; }
.book-title { font-size: 2em; margin: 0 0 0.5em; }
.subtitle { font-style: italic; font-size: 1.2em; }
.author { margin-top: 3em; letter-spacing: 0.08em; }
.copyright { margin-top: 40%; font-size: 0.8em; }
.dedication p { font-style: italic; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100vh; }
.chapter-title { text-align: center; text-transform: uppercase; letter-spacing: 0.15em; font-size: 1.3em; margin: 2em 0 1.5em; }
.opener { display: block; max-width: 100%; margin: 0 auto 1em; }
.ornament { text-align: center; margin: 1.5em 0; }
.piece-title { font-style: italic; font-size: 1.15em; margin: 1.5em 0 0.8em; text-align: ${center(d.titleAlign === 'center')}; }
.piece p { margin: 0 0 0.9em; }
.poem { text-align: ${center(d.poemAlign === 'center')}; }
.new-page { page-break-before: always; break-before: page; }
.figure { margin: 1.5em 0; text-align: center; }
.figure img { max-width: 100%; }
figcaption { font-style: italic; font-size: 0.9em; margin-top: 0.5em; }
nav ol { list-style: none; padding: 0; }
nav li { margin: 0.4em 0; }
`;
}
