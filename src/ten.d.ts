export type Config = {
    defaults: {
        title: string,
        layout: string,
        rootDir: string,
        cacheFile: string,
        contentDir: string,
        layoutDir: string,
        partialDir: string,
        staticDir: string,
        outputDir: string
    }

    transformUri(uri: string): string,

    getLayout(config: Config, options: Options, page: Page): string | Promise<string>,

    validateFrontmatter(inputFile: string, frontmatter: Frontmatter): Frontmatter,

    handlebarsHelpers: Record<string, () => string>,

    tenHelpers: Record<string, () => string>,
}

export type TenJs = {
    Meta?({ config: Config, options: Options }): Promise<TenJsMeta>

    Header?({ config: Config, options: Options }): Promise<string>

    GenerateSlugMapping?({ config: Config, options: Options }): Promise<TenJsSlugMapping>

    GenerateTemplateVariables?({ config: Config, options: Options}): Promise<Record<PropertyKey, any>>
}

type TenJsMeta = {
    slug?: string,
    layout?: string
}

type TenJsSlugMapping = Array<{
    slug: string,
    count: number
}>

export type Options = {
    dir: string,
    command: 'build' | 'serve' | 'new',
    clean: boolean,
    verbose: boolean
}

export type Page = {
    inputFile: string,
    inputUri: string,
    outputUri: string,
    entrypointUri: string,
    tenJs: typeof TenJs,
    parameters: Record<PropertyKey, any>
}

export type Frontmatter = {
    title?: string,
    author?: string,
    date?: string,
    layout?: string,
    slug?: string,
    categories?: string[],
    tags?: string[]
}

export {}
