/**
 * CSS modules are compiled by this package's own client build, which emits a
 * class map. TypeScript only needs to know the shape.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
