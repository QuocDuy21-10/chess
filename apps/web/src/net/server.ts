/** NEXT_PUBLIC_SERVER_URL, or port 3001 on the page's own host so a phone can reach a development server. */
export const serverUrl = () => process.env.NEXT_PUBLIC_SERVER_URL ?? `${location.protocol}//${location.hostname}:3001`;
