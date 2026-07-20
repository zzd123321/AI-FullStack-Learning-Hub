export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Response(response.statusText || '请求失败', {
      status: response.status,
      statusText: response.statusText
    })
  }

  // 网络响应是运行时输入，只能先作为 unknown 交给领域解析器验证。
  return response.json()
}
