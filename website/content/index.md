+++
title = 'Sauerkraut'
+++

This website was made with [Sauerkraut](https://github.com/hyperupcall-projects/sauerkraut). Sauerkraut supports some interesting features.

## LaTeX

LaTeX is supported.

The following

$$\int_{a}^{b} x^2 dx$$

Is an integral

Integrate $\int x^3 dx$

### mhchem

$\ce{H2O}$

## Mermaid

```mermaid
graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;
```

## Railroad Diagram

[railroad-diagrams](https://github.com/tabatkins/railroad-diagrams)

```railroad
rr.Diagram(
  rr.Optional('+', 'skip'),
  rr.Choice(0,
  rr.NonTerminal('name-start char'),
  rr.NonTerminal('escape')),
  rr.ZeroOrMore(
  rr.Choice(0,
  rr.NonTerminal('name char'),
  rr.NonTerminal('escape'))))
```
