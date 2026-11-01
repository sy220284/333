/** Connector-specific streaming content blocks used by the optional CONNECTOR_TEXT feature. */
export interface ConnectorTextBlock {
  type: 'connector_text'
  connector_text: string
  signature?: string
}
export interface ConnectorTextDelta {
  type: 'connector_text_delta'
  connector_text: string
}
export function isConnectorTextBlock(value: unknown): value is ConnectorTextBlock {
  return typeof value === 'object' && value !== null &&
    'type' in value && value.type === 'connector_text' &&
    'connector_text' in value && typeof value.connector_text === 'string'
}
