export as namespace Sauerkraut

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

	renderLayout(
		layoutName: string,
		vars: {
			page: Page
			title: string
			env: Env
			body: string
		},
		config: Config,
		options: Options,
	): string | Promise<string>

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

export type Options = {
	dir: string
	command: 'serve' | 'build' | 'new'
	clean: boolean
	watch: boolean
	verbose: boolean
	positionals: string[]
	env: '' | 'development'
}

export type Page = {
	inputFile: string
	inputUri: string
	tenFile: TenFile
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
