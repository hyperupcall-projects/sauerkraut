export as namespace Ten

export type Config = {
	defaults: {
		title: string
		rootDir: string
		contentDir: string
		layoutDir: string
		partialDir: string
		staticDir: string
		outputDir: string
	}

	transformUri(uri: string): string

	decideLayout(config: Config, options: Options, page: Page): string | Promise<string>

	validateFrontmatter(inputFile: string, frontmatter: Frontmatter): Frontmatter

	handlebarsHelpers: Record<string, () => string>

	tenHelpers: Record<string, () => string>
}

export type TenFile = {
	Meta?({ config: Config, options: Options }): Promise<TenJsMeta>

	Head?({ config: Config, options: Options }): Promise<TenJsHead>

	GenerateSlugMapping?({
		config: Config,
		options: Options,
	}): Promise<TenJsGenerateSlugMapping>

	GenerateTemplateVariables?(
		arg0: { config: Config; options: Options },
		arg1: Record<PropertyKey, unknown>,
	): Promise<Record<PropertyKey, any>>
}

export type TenRoute = {
	slug?: string
}

export type Options = {
	dir: string
	command: 'serve' | 'watch' | 'build' | 'new'
	clean: boolean
	verbose: boolean
	positionals: string[]
}

export type Page = {
	inputFile: string
	inputUri: string
	tenFile: TenFile
	tenRoute: TenRoute
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

export type TenJsMeta = {
	slug?: string
	layout?: string
}

export type TenJsHead = {
	title: string
	content: string
}

export type TenJsGenerateSlugMapping = Array<{
	slug: string
	count: number
}>
