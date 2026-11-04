import { authResultAssets } from "./authResultAssets.ts";

export { authResultAssets };

type Artwork =
	| typeof authResultAssets.checkmark
	| typeof authResultAssets.brokenLink;
type Result = {
	ok: boolean;
	heading: string;
	message: string;
	detail?: string;
};

const escapeHtml = (value: string): string =>
	value.replace(/[&<>"']/g, (character) => {
		const entity: Record<string, string> = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;",
		};
		return entity[character] ?? character;
	});

function pathForFrame(rows: readonly string[]): string {
	let path = "";
	rows.forEach((row, y) => {
		for (const match of row.matchAll(/#+/g)) {
			path += `M${match.index} ${y}h${match[0].length}v1h-${match[0].length}z`;
		}
	});
	return path;
}

function renderArtwork(artwork: Artwork): string {
	const rest = artwork.frames[artwork.rest];
	if (!rest) throw new Error(`Invalid ${artwork.name} animation rest frame`);
	const duration = Number(
		(artwork.sequence.length / artwork.frameRate).toFixed(4),
	);
	const moving = artwork.frames
		.map((frame, frameIndex) => {
			if (frameIndex !== artwork.rest && !artwork.sequence.includes(frameIndex))
				return "";
			const values = artwork.sequence
				.map((index) => (index === frameIndex ? 1 : 0))
				.join(";");
			const opacity = frameIndex === artwork.rest ? "" : ' fill-opacity="0"';
			return `<path d="${pathForFrame(frame)}"${opacity}><animate attributeName="fill-opacity" calcMode="discrete" begin="0s" dur="${duration}s" repeatCount="indefinite" values="${values}"/></path>`;
		})
		.join("");
	return `<svg class="pixelgram" viewBox="0 0 ${artwork.width} ${artwork.height}" width="${artwork.width * 4}" height="${artwork.height * 4}" fill="#D97757" shape-rendering="crispEdges" aria-hidden="true"><g class="moving">${moving}</g><path class="resting" display="none" d="${pathForFrame(rest)}"/></svg>`;
}

const css = `*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:light dark;--bg:#f9f9f7;--card:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--line:rgba(11,11,11,.1)}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0b;--card:#151515;--ink:#f0efec;--ink2:#c3c2b7;--line:rgba(255,255,255,.1)}}
html,body{margin:0;padding:0}
body{min-height:100vh;background:var(--bg);color:var(--ink);font:15px/1.5 "anthropic-sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;display:flex;align-items:center;justify-content:center;padding:48px 24px 14vh;text-align:center}
main{width:100%;max-width:480px}
.pixelgram{display:block;margin:27px auto 12px;overflow:visible}
@media (prefers-reduced-motion:reduce){.pixelgram .moving{display:none}.pixelgram .resting{display:inline}}
h1{font-family:"anthropic-serif",ui-serif,Charter,"Iowan Old Style",Georgia,serif;font-weight:400;font-size:34px;line-height:1.15;margin:0 0 10px;text-wrap:balance}
.sub{margin:0 auto;color:var(--ink2);max-width:44ch;text-wrap:pretty}
.detail{margin-top:24px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink2);text-align:left;overflow-wrap:anywhere}
@media (max-width:520px){h1{font-size:27px}body{padding:32px 20px 14vh}}`;

const font = (name: string, bytes: string) =>
	`@font-face{font-family:"${name}";src:url(data:font/woff2;base64,${bytes}) format("woff2");font-weight:400;font-style:normal;font-display:swap}`;
const fonts =
	font("anthropic-sans", authResultAssets.sans) +
	font("anthropic-serif", authResultAssets.serif);

export function renderAuthResultPage({
	ok,
	heading,
	message,
	detail,
}: Result): string {
	const artwork = renderArtwork(
		ok ? authResultAssets.checkmark : authResultAssets.brokenLink,
	);
	const details = detail
		? `<div class="detail">${escapeHtml(detail)}</div>`
		: "";
	const close = ok
		? "<script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script>"
		: "";
	return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Claude Code</title><style>${fonts}\n${css}</style></head><body><main>${artwork}<h1>${escapeHtml(heading)}</h1><p class="sub">${escapeHtml(message)}</p>${details}</main>${close}</body></html>`;
}
