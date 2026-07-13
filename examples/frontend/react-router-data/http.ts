export async function readJson<ResponseBody>(
  response: Response
): Promise<ResponseBody> {
  if (!response.ok) {
    throw new Response(response.statusText || '请求失败', {
      status: response.status,
      statusText: response.statusText
    })
  }

  return (await response.json()) as ResponseBody
}
