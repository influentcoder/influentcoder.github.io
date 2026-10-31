import satori, { type SatoriOptions } from "satori";
import sharp from "sharp";
import RobotoMonoBold from "@/assets/roboto-mono-700.ttf";
import RobotoMono from "@/assets/roboto-mono-regular.ttf";
import { siteConfig } from "@/site.config";
import { ogMarkup } from "./og-image/_ogMarkup";

// Default social preview image, for pages without their own (posts get one from og-image/).
const ogOptions: SatoriOptions = {
	fonts: [
		{ data: Buffer.from(RobotoMono), name: "Roboto Mono", style: "normal", weight: 400 },
		{ data: Buffer.from(RobotoMonoBold), name: "Roboto Mono", style: "normal", weight: 700 },
	],
	height: 630,
	width: 1200,
};

export async function GET() {
	const svg = await satori(ogMarkup(siteConfig.description, ""), ogOptions);
	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
}
