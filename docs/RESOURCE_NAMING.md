# SceneFlow resource naming

The project applies `DBX-STD-NAMING-001` version 1.0.0 to every newly created resource.

| Resource | Name | Rule |
| --- | --- | --- |
| Bundle | `media-ott-recommendations` | `{domain}-{product}` |
| Catalog | `media_dev` | `{domain}_{environment}` |
| Schema | `ott_recommendations` | `{product-or-subject}` |
| Source volume | `media_dev.ott_recommendations.source_datasets` | `{content-or-purpose}` |
| Databricks App | `media-ott-consumer-app` | `{domain}-{product}-{purpose}-app` |

Tables and views use lowercase plural or descriptive business-object names without physical-type prefixes or suffixes. Bundle logical keys and application configuration keys use `snake_case`.

## Existing-resource exception

The existing Workspace allows only its provisioned `Serverless Starter Warehouse`; the create control is disabled and the Workspace API rejects additional Warehouse creation. The project therefore reuses warehouse ID supplied at deployment time rather than renaming or recreating that existing resource. This follows the standard's migration rule not to rename existing resources solely for naming consistency.

The desired compliant name for a future Workspace that permits additional SQL Warehouses is `media-recommendations-warehouse`.

## Development tags

New Unity Catalog assets use:

- `environment=dev`
- `domain=media`
- `product=ott_recommendations`
- `owner_group=grp-dbx-ott-recommendations-owners`
- `cost_center=demo`
- `managed_by=manual`
- `data_classification=internal`

`cost_center=demo` is a development assumption and must be replaced by an approved financial cost-center identifier before staging or production promotion. The owner group is a normalized target name; this account cannot create an account group without Account Admin privileges.
