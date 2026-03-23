import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "dist/com.josh-tf.fxcommands.sdPlugin";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		format: "esm",
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		}
	},
	external: ["node:net"],
	plugins: [
		{
			name: "watch-externals",
			buildStart: function () {
				this.addWatchFile("com.josh-tf.fxcommands.sdPlugin/manifest.json");
			}
		},
		typescript(),
		nodeResolve({
			exportConditions: ["node"],
			preferBuiltins: true
		}),
		commonjs()
	]
};

export default config;
