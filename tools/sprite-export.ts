// Developer page: renders every artPieces() entry to a 1:1 PNG and shows
// them. tools/export-sprites.mjs reads window.artExport and saves them.
import { artPieces } from "../src/defend/art-export.ts";

const list = document.querySelector("#pieces")!;
const pieces = artPieces().map(({ name, w, h, about, pixels }) => {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!, img = c.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(pixels());
  c.putImageData(img, 0, 0);
  const png = cv.toDataURL("image/png");
  const fig = document.createElement("figure"), pic = document.createElement("img"), cap = document.createElement("figcaption");
  pic.src = png;
  pic.width = w * 4;
  pic.title = about;
  cap.textContent = name;
  fig.append(pic, cap);
  list.append(fig);
  return { name, w, h, about, png };
});
Object.assign(window, { artExport: pieces });
