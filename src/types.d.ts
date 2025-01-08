export as namespace Sauerkraut

export type Config = {
	title: string
	rootDir: string
	contentDir: string
	staticDir: string
	outputDir: string

	transformUri(config: Config, uri: string): string
	validateFrontmatter(config: Config, uri: string, frontmatter: Frontmatter): Frontmatter
	createHtml(config: Config, layoutData: layoutData): string | Promise<string>

	tenHelpers: Record<string, () => string>
}

export type SkFile = {
	Meta?({ config: Config, options: Options }): Promise<SkJsMeta>
	Head?({ config: Config, options: Options }): Promise<SkJsHead>

	GenerateSlugMapping?({
		config: Config,
		options: Options,
	}): Promise<SkJsGenerateSlugMapping>
	GenerateTemplateVariables?(
		arg0: { config: Config; options: Options },
		arg1: Record<PropertyKey, unknown>,
	): Promise<Record<PropertyKey, any>>
}

export type FileExplorerTree = (FileExplorerFile | FileExplorerDirectory)[]
export type FileExplorerFile = {
	type: 'file'
	name: string
}
export type FileExplorerDirectory = {
	type: 'dir'
	name: string
	attrs: FileExplorerDirAttrs
	children: FileExplorerFile | FileExplorerDirectory
}
export type FileExplorerDirAttrs = {
	sortTier: number
	hideChildren: boolean
	fullpath: string
}

export type Options = {
	dir: string
	command: 'serve' | 'build' | 'new'
	clean: boolean
	watch: boolean
	bundle: boolean
	verbose: boolean
	positionals: string[]
	env: Environment
}

export type Page = {
	inputFile: string
	inputUri: string
	skFile: SkFile
	parameters: Record<PropertyKey, any>
	outputUri: string
}

export type Frontmatter = {
	title?: string
	author?: string
	date?: string
	layout?: string
	slug?: string
	categories?: string[]
	tags?: string[]
}

export type LayoutData = {
	layout: string
	body: string
	environment: Environment
	title: string
}

export type SkJsMeta = {
	slug?: string
	layout?: string
}

export type SkJsHead = {
	title: string
	content: string
}

export type SkJsGenerateSlugMapping = Array<{
	slug: string
	count: number
}>

type Environment = '' | 'development'
