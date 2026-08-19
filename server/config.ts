export interface DataNamespace {
  catalog: string;
  schema: string;
}

const unityCatalogIdentifier = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function requiredIdentifier(name: string): string {
  const value = process.env[name];
  if (!value || !unityCatalogIdentifier.test(value)) {
    throw new Error(`${name} must be configured as a lowercase snake_case Unity Catalog identifier.`);
  }

  return value;
}

export function getDataNamespace(): DataNamespace {
  return {
    catalog: requiredIdentifier('DATABRICKS_CATALOG'),
    schema: requiredIdentifier('DATABRICKS_SCHEMA'),
  };
}

export function quoteIdentifier(value: string): string {
  if (!unityCatalogIdentifier.test(value)) {
    throw new Error(`Unsafe Unity Catalog identifier: ${value}`);
  }

  return `\`${value}\``;
}

export function qualifiedName(namespace: DataNamespace, objectName: string): string {
  return [namespace.catalog, namespace.schema, objectName].map(quoteIdentifier).join('.');
}
