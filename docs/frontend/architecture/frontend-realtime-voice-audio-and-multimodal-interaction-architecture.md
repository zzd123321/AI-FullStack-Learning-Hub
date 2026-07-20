---
title: 前端语音、音频与实时多模态交互架构
description: 系统掌握媒体权限、音频轨、Web Audio、WebRTC、实时会话、VAD、打断、字幕、设备管理、可访问性与生产治理
outline: deep
---

# 前端语音、音频与实时多模态交互架构

实时语音不是给文本聊天加一个麦克风按钮。声音从用户开口到听见回复，至少经过设备权限、采集、浏览器音频处理、编码、网络传输、服务端轮次判断、模型生成、解码、播放和会话状态同步。

任何一层都可能改变用户体验：

- 权限提示被忽略，Promise 长期不结束；
- 用户点击了 mute，但麦克风指示灯仍亮；
- 页面主线程卡顿，音量动画掉帧，甚至自定义处理出现爆音；
- VAD 把思考停顿误判成说完，AI 抢话；
- 用户打断播放，模型上下文却仍认为整段回答已经说完；
- 蓝牙耳机切换后音频轨 ended；
- 网络往返、抖动或丢包增加，界面只显示“AI 很慢”；
- 字幕不断改写，读屏器和听障用户无法跟随；
- 页面结束后 track、AudioContext 和 PeerConnection 仍未释放。

这些故障之所以难排查，是因为“语音会话”并不是一条管道，而是几条时间线同时前进：设备在采集、网络在传媒体、控制通道在发事件、播放器在消耗缓冲、界面还要解释当前状态。

本课先用浏览器媒体原语建立正确心智模型，再逐步走到 WebRTC、轮次检测与打断，最后补齐字幕、无障碍、隐私和生产治理。OpenAI Realtime API 只是供应商适配案例；重点不是背事件名，而是弄清媒体面、控制面、状态面与产品 UI 各自拥有什么。

## 学习目标

完成本课后，你应该能够：

- 解释 `MediaStream`、`MediaStreamTrack`、Web Audio 与 WebRTC 的职责；
- 正确申请、静音、替换和释放麦克风；
- 区分媒体音频通道与控制事件通道；
- 设计实时语音的显式状态机和错误恢复；
- 根据场景选择 WebRTC、WebSocket、文件转录或普通 TTS；
- 理解 VAD、Push-to-talk、Barge-in 与会话截断；
- 区分 partial/final transcript 与实际播放时间线；
- 用 AudioWorklet 处理真正的实时音频，而不是阻塞主线程；
- 设计字幕、键盘操作、视觉反馈和无音频降级；
- 建立延迟、丢包、隐私、安全、测试与资源治理。

## 先建立声音在浏览器中的路径

如果一上来就创建 PeerConnection，很容易把权限、采集、处理、传输和播放混成一个“连接成功”布尔值。先把系统拆开，之后每个事件才知道应该改变哪一层。

### 先拆成四个平面

```text
媒体面：麦克风 track → 编解码 → 网络 → 远端 audio track → 扬声器
控制面：session.update、speech_started、response.cancel、tool events
状态面：权限、连接、说话者、响应、错误、设备、字幕
产品面：按钮、波形、字幕、确认、降级、隐私说明
```

WebRTC 中媒体和 DataChannel 可以经过不同内部队列，不能假设音频样本与控制 JSON 到达的瞬间完全一致。WebSocket 自定义 PCM 方案则常把控制与音频包放在同一连接，但播放时钟仍由客户端维护。

示例公共契约明确了这些不变量：

<<< ../../../examples/frontend/realtime-voice/realtime-voice-contract.md

#### 状态不是来自一个事件

“AI 正在说话”可能涉及：模型开始生成、远端 track 收到包、音频元素开始播放、用户真正听到声音。产品需要为指标和 UI 选定准确时点，不能用 `response.created` 冒充首音频播放。

### 先选择交互产品，而不是先选 API

| 产品形态 | 推荐起点 | 原因 |
| --- | --- | --- |
| 上传录音转文字 | 文件上传 + 请求式转录 | 有明确开始结束，不需长期会话 |
| 点击播放朗读 | 请求式 TTS | 可缓存、可下载、实现简单 |
| 按住说话问答 | PTT + 请求式/实时 API | 轮次由用户明确控制 |
| 可打断语音助手 | WebRTC Realtime | 低延迟双向媒体与控制 |
| 客服实时转录 | 实时转录会话 | 重点是连续字幕而非模型发声 |
| 电话接入 | SIP/后端媒体基础设施 | 浏览器不是电话网络入口 |

OpenAI 官方“Realtime and audio”指南同样建议从结果出发：实时 session 适合需要低延迟的 live audio；文件、有界请求或不需要实时会话的语音生成适合请求式 API。

不要为了一个“朗读回答”按钮维护 WebRTC 会话，也不要用上传完整 WAV 的请求模拟需要自然打断的对话。

### 麦克风权限：这是产品流程

`getUserMedia()` 只能在安全上下文使用，并要求用户授权。权限请求可能：

- resolve 为带音频 track 的 `MediaStream`；
- 因拒绝、安全策略、无设备、约束不满足、设备忙而 reject；
- 用户一直不选择，从而长期 pending。

#### 只在明确用户意图后申请

页面加载即弹麦克风权限既打扰用户，也缺少用途上下文。更好的流程：

1. 显示语音能力和数据用途；
2. 用户点击“开始语音”；
3. 再调用 `getUserMedia`；
4. 等待期间按钮显示明确状态并允许返回；
5. 拒绝后提供浏览器设置说明和文字输入。

完整封装：

<<< ../../../examples/frontend/realtime-voice/media-capture.ts

约束中的 echo cancellation、noise suppression、auto gain control 是请求，不应假设所有设备都按同样方式实现。连接后可读取 `track.getSettings()` 观测实际结果。

#### 错误必须可行动

- denied：说明如何重新授权，并保留文字入口；
- missing：提示连接麦克风或放宽精确 deviceId；
- busy：提示关闭占用设备的应用，允许重试；
- unavailable：记录原始错误用于诊断，用户看到通用恢复方案。

错误分类不能依赖英文 `message`，应使用 DOMException `name`。

#### mute、disable 与 stop 不同

`track.enabled = false` 通常让轨道输出静音帧，适合会话中 mute；连接和设备轨生命周期仍存在。`track.stop()` 才结束该 track，离开会话时必须调用。

如果 UI 写“麦克风已关闭”，但只是把 GainNode 设为 0、仍在采集，就误导了用户。按钮文案和浏览器隐私指示必须匹配真实行为。

### MediaStream 与 Track 的生命周期

`MediaStream` 是若干 track 的容器；track 才表示具体音频来源。要监听：

- `ended`：设备断开、用户从浏览器 UI 撤销权限或来源结束；
- `mute` / `unmute`：来源暂时无法提供媒体，不等于产品 mute；
- `getSettings()`：实际 deviceId、sampleRate、channelCount 等；
- `applyConstraints()`：在同一 track 上尝试调整约束。

设备切换的两种方式：

1. 获取新 track，调用 `RTCRtpSender.replaceTrack(newTrack)`，成功后 stop 旧 track；
2. 关闭并重建整个 session，简单但有明显中断。

切换必须可回滚：新设备申请失败时保留旧轨，不要先 stop 再尝试。

页面清理至少包括：

```text
stop all local tracks
close RTCDataChannel
close RTCPeerConnection
pause remote audio + clear srcObject
cancel RAF/timers/stats polling
close AudioContext
remove devicechange/listeners
```

### Web Audio：分析和处理，不是网络协议

Web Audio 使用 AudioNode 图：

```text
MediaStreamSource
  ├─ AnalyserNode → 音量/波形 UI
  ├─ Gain/Filter → 本地处理
  └─ MediaStreamDestination → 新媒体轨（需要时）
```

音量显示示例计算 time-domain RMS：

<<< ../../../examples/frontend/realtime-voice/audio-level-meter.ts

这个数值适合 UI 反馈，不是可靠 VAD：噪声可能很响，轻声可能很低，语义停顿更无法仅靠能量判断。业务轮次应使用服务端 VAD 事件或明确 PTT。

#### AudioContext 与自动播放策略

浏览器可能在没有用户手势时让 `AudioContext` 处于 suspended，音频元素 autoplay 也可能被阻止。应在用户点击开始时 `resume()`，并处理 `audio.play()` Promise失败。

不要为每个消息创建一个 AudioContext。会话/媒体模块拥有一个上下文，离开时 close。

#### AudioWorklet 何时需要

若 WebSocket 方案需要实时 PCM 重采样、编码前处理或自定义 DSP，使用 AudioWorklet，而不是已废弃、运行在主线程的 `ScriptProcessorNode`。AudioWorklet 在 Web Audio 渲染线程执行，处理函数必须：

- 固定、短小、避免阻塞；
- 不做 fetch、DOM、复杂日志；
- 避免每个音频量子分配大对象；
- 通过 MessagePort 与主线程传递有界批次；
- 明确 overload 时丢弃可丢数据还是停止会话。

如果 WebRTC 已处理编解码、抖动缓冲、回声消除和媒体传输，不要为了“掌控 PCM”绕开这些能力。

### 采样、声道与 PCM

音频常见概念：

- sample rate：每秒采样次数；
- channel count：单声道/立体声；
- sample format：Float32、PCM16 等；
- frame：同一时间位置的一组声道样本；
- codec：Opus、AAC 等压缩格式；
- container：WAV、WebM 等封装。

浏览器 Web Audio 通常用 `Float32`，范围接近 `[-1, 1]`。转换到 PCM16 必须裁剪和正确映射正负端点：

<<< ../../../examples/frontend/realtime-voice/pcm16.ts

但格式转换不等于重采样。48 kHz → 24 kHz 不能简单每两个取一个，否则会混叠；需要低通滤波和采样率转换。生产中优先让 WebRTC/成熟音频库承担转换，并严格遵循目标 API 当前格式要求。

#### 数据量预算

未压缩单声道 PCM16 24 kHz：

```text
24,000 samples/s × 2 bytes ≈ 48 KB/s（尚未计 Base64 与协议开销）
```

Base64 还会增加体积和分配。应批量发送、设置队列上限，并观察网络积压；不要在主线程为每个 128-sample quantum 做 JSON + Base64。

## 建立一条可控的实时会话

前面解决的是“怎样得到并理解声音”，现在才进入传输。浏览器语音首选 WebRTC，不是因为 WebSocket 做不到，而是因为 WebRTC 已经实现了大量媒体系统必须面对的网络与播放问题。

### 为什么浏览器实时语音优先 WebRTC

WebRTC 提供：

- 浏览器原生麦克风 track 传输；
- 音频 codec 协商；
- 抖动缓冲、丢包恢复和拥塞控制；
- NAT/ICE/DTLS/SRTP 等连接与安全机制；
- 远端 audio track；
- DataChannel 承载控制事件；
- `getStats()` 网络与媒体诊断。

WebSocket 提供的是可靠有序字节流，PCM 采集、编码、背压、播放排队、打断定位都由应用承担。它适合服务端到服务端、特殊媒体管线或确有需要的兼容方案，不是浏览器语音的自动首选。

### 建立 WebRTC 会话

通用浏览器流程：

```text
用户手势
→ getUserMedia
→ RTCPeerConnection
→ addTrack(local microphone)
→ create DataChannel(control events)
→ createOffer + setLocalDescription
→ 自有后端交换 SDP / session
→ setRemoteDescription(answer)
→ ontrack 播放远端音频
```

示例把 SDP 交换函数作为依赖注入，从而不在浏览器核心里固定供应商端点：

<<< ../../../examples/frontend/realtime-voice/webrtc-session.ts

生产实现还要监听 `connectionState`、`iceConnectionState`、DataChannel open/close/error，并为连接超时与重建建立策略。

#### OpenAI Realtime 的两种浏览器认证路径

官方 WebRTC 指南当前提供：

1. unified interface：浏览器把 SDP 发给自有后端，后端用标准 API Key 和 session 配置请求 OpenAI，再把 answer SDP 返回；
2. ephemeral token：后端用标准 Key 签发短期 client secret，浏览器用短期凭据直接交换 SDP。

无论哪种，标准长期 API Key 都不能进入浏览器。自有后端还应认证用户、设置允许的模型、voice、tools、时长、安全标识和速率，不允许浏览器任意签发无限 session。

#### ICE 不是“连接慢就重试 fetch”

WebRTC 建连包含 SDP、ICE candidate gathering、连通性检测和加密协商。需要区分：

- SDP/session endpoint 失败；
- permission 或 local track 失败；
- ICE checking 超时/failed；
- DataChannel 未 open；
- media track 没有声音；
- 会话服务返回协议 error。

不同阶段要记录不同指标和恢复动作。

### 状态机：谁正在说话只是其中一部分

完整状态包含 permission、connection、turn 和 response：

<<< ../../../examples/frontend/realtime-voice/types.ts

<<< ../../../examples/frontend/realtime-voice/voice-session-reducer.ts

核心转换：

```text
idle → requesting-permission → connecting → listening
listening → user-speaking → assistant-thinking → assistant-speaking
assistant-speaking + speech-started → interrupting → user-speaking/listening
任意活动态 → failed / ended
```

真正的 `connected` 不应由“SDP 请求返回”猜测，而应由 `session.created` 这类会话就绪事件确认。供应商事件先经过运行时 adapter：

<<< ../../../examples/frontend/realtime-voice/realtime-event-adapter.ts

示例只映射课程所需事件。真实 Realtime 协议包含更多 session、conversation、audio、transcript、rate limit、tool 与 error 事件；生产 adapter 应依据当前 schema 逐 variant 校验。

这里刻意把 `response.output_item.added` 映射为“响应条目已创建”，而不是“音频已播放”。WebRTC 媒体与 DataChannel 不共享严格到达顺序；示例由 `<audio>` 的 `playing` 事件触发 `audio-started`。如果产品指标要求“用户真正听到首音频”，还应结合播放时钟和设备侧观测，不能只看模型事件。

同理，`audio.play()` 被自动播放策略拒绝时，网络会话可能仍然健康。状态机把它记为 `audioPlaybackBlocked`，界面提供“恢复声音”按钮；不能因为一次播放 Promise 失败就销毁整个会话。

测试覆盖权限、连接、响应条目、实际播放状态和打断：

<<< ../../../examples/frontend/realtime-voice/voice-session.test.mts

不要让 DOM event、WebRTC event 和供应商 event 在组件内直接互相修改布尔值。Reducer 提供唯一合法状态转换，Effect 执行媒体动作。

## 管理轮次、打断与字幕

连接稳定之后，最难的产品问题才出现：谁说完了、谁正在说、用户打断后模型应该记住多少。这里必须同时管理生成时间线、实际播放时间线和会话历史，任何两条都不能互相冒充。

### VAD：决定轮次，而不只是显示波形

Voice Activity Detection 检测用户何时开始/停止说话。常见策略：

#### Server VAD

根据音量阈值、前置 padding 与静音时长切分。优点是行为直观、延迟可调；缺点是噪声、轻声和思考停顿容易误判。

OpenAI Realtime 当前通过 `input_audio_buffer.speech_started` 与 `speech_stopped` 通知轮次，可配置 threshold、prefix padding、silence duration，以及是否自动创建/打断响应。

#### Semantic VAD

根据话语语义推断是否说完，可能减少“嗯……”或句子未结束时抢话，但会增加不确定等待。当前官方配置提供 eagerness 档位；它仍不是读心术，产品必须允许用户打断和切换 PTT。

#### Push-to-talk

由按下/释放明确轮次，嘈杂环境、对讲式工作流和可访问场景常更可靠：

<<< ../../../examples/frontend/realtime-voice/push-to-talk.ts

示例处理 repeat、IME composition、blur 和清理。真实产品还要提供可点击/触摸按钮，不能只支持空格键；按钮需要 `aria-pressed` 或明确录音状态。

PTT 不等于仅把 UI 变红：关闭自动 VAD 后，开始时清理旧 input buffer，结束时提交 buffer 并触发 response；具体事件随传输和供应商协议适配。

### Barge-in：打断的三条时间线

用户在 AI 说话时开口，至少要同步：

1. **听觉时间线**：立刻停止尚未播放的声音；
2. **生成时间线**：取消进行中的响应，避免继续生产；
3. **会话时间线**：删除模型实际未说出的部分，否则下一轮上下文错误。

只 pause `<audio>` 解决了第一条，模型仍可能认为完整回答已交付。

#### OpenAI WebRTC 与 WebSocket 的当前差异

官方 Realtime conversation 文档说明：

- WebRTC/SIP：服务器管理输出音频缓冲，用户打断时可自动截断未播放内容；
- WebSocket：客户端管理播放，必须停止播放、计算已听到的毫秒数，并发送 `conversation.item.truncate`。

下面是 **WebSocket 自管播放路径** 的最小控制器：

<<< ../../../examples/frontend/realtime-voice/interruption-controller.ts

示例把“停止播放并返回已确认播放毫秒数”抽象为 `ManagedAudioPlayback`。WebSocket PCM 播放器应根据音频时钟和消费游标实现它；网络收到多少字节、解码了多少样本、进入队列多久，都不等于用户实际听了多久。

测试还验证重复触发打断不会发送第二组 cancel/truncate：

<<< ../../../examples/frontend/realtime-voice/interruption-controller.test.mts

WebRTC 路径不要重复发送手工 truncate，除非当前供应商协议明确要求；应遵循服务端 output buffer 事件和官方说明。

### 字幕与音频不是严格一一对应

转录可能经历 partial → revised partial → final。不能每个 partial 都追加为新行：

<<< ../../../examples/frontend/realtime-voice/transcript-store.ts

<<< ../../../examples/frontend/realtime-voice/transcript-store.test.mts

数据模型使用稳定 segment ID 做 upsert，并防止迟到 partial 覆盖 final。

#### 字幕的产品语义

- partial：即时反馈，可更正，不用于审计；
- final：服务端确认段落，可持久化；
- model response transcript：便于阅读，不一定精确描述已播放部分；
- human-edited transcript：另一版本，需要作者与修改记录。

OpenAI 官方打断说明特别指出，音频截断与文字不能精确对齐；不要用字符比例推算播放时间。

#### 字幕可访问性

- 提供持续可见字幕，不以音频作为唯一信息；
- partial 使用低打扰视觉更新，不在 aria-live 每次全量重读；
- final 段落再节制播报；
- 标明用户/助手与语言；
- 允许复制、调整字号和查看历史；
- 识别错误时允许用户纠正关键实体。

## 把实时能力做成可用的产品

媒体协议正确仍不代表用户能顺利交谈。扬声器回声、自动播放限制、网络抖动和模态不同步，都会让“技术上已连接”的会话在体验上不可用。

### 回声、噪声与双工体验

#### Echo cancellation

扬声器播放的助手声音可能被麦克风再次采集，造成模型“听见自己”。浏览器约束可请求 AEC，但效果随设备、浏览器、耳机和音量变化。

工程措施：

- 默认请求 `echoCancellation`；
- 鼓励耳机，尤其在嘈杂环境；
- 不重复叠加多个不兼容降噪/AEC 管线；
- 监控模型播放时 speech_started 的异常比例；
- 提供 PTT 或 half-duplex 降级；
- 不把所有回声问题都归咎于模型。

#### Full duplex 与 half duplex

- full duplex：双方可同时说，体验自然但回声、打断和状态复杂；
- half duplex：助手说话时暂停用户上行，简单但不能自然打断；
- hybrid：保持输入用于 VAD，一旦检测说话立即取消播放。

产品应明确选择，不要让 track.enabled 和播放器状态偶然决定。

### 远端播放与自动播放

WebRTC `ontrack` 得到远端音频 `MediaStream`，赋给 `<audio>.srcObject`。还要处理：

- `audio.play()` 被自动播放策略拒绝；
- 用户调整本地音量但不应改变模型输入；
- 输出设备选择支持不一致；
- AirPods/蓝牙 profile 切换造成采样质量变化；
- route/锁屏/后台时浏览器行为差异；
- `track.onended`、PeerConnection disconnected/failed。

播放失败时显示“点击恢复声音”，而不是继续让状态显示 assistant-speaking。

视觉波形不能用 CSS 随机动画伪装真实音频状态。可以基于 AnalyserNode，但要尊重 reduced motion 并限制 RAF 开销。

### 连接质量与可观测性

`RTCPeerConnection.getStats()` 返回媒体/连接统计。示例提取 RTT、jitter、lost 与 received：

<<< ../../../examples/frontend/realtime-voice/connection-stats.ts

生产监控按时间采样差值而非只看累计值：

```text
packet loss rate = lostDelta / (lostDelta + receivedDelta)
```

可能的用户体验关联：

- RTT 高：交互响应慢；
- jitter 高：播放需要更大缓冲，声音断续；
- packet loss 高：音质下降、转录错误；
- available outgoing bitrate 低：上行质量受限；
- ICE state 变化：网络切换或连接失败。

统计字段随 report type 和浏览器不同，读取前做类型/存在性检查。不要上传 IP candidate、设备标签或原始音频到普通分析平台。

#### 延迟拆解

```text
permission latency
connection setup latency
speech start → VAD start event
speech stop → turn committed
turn committed → response created
response created → first remote audio packet
first packet → actual playback
barge-in → audible stop
```

只有拆开，才知道要调 VAD、网络、模型、播放还是 UI。

### 错误与恢复

| 失败 | 典型恢复 |
| --- | --- |
| permission denied | 文字入口 + 设置说明 |
| no device / device busy | 选择设备、重试 |
| SDP/session endpoint 失败 | 有预算退避，保留已授权 track 或主动释放 |
| ICE disconnected | 短暂等待；超时后重建 session |
| ICE failed | 完整重连，不复用坏 PeerConnection |
| DataChannel closed | 停止将 UI标成已连接，重建控制面 |
| remote track ended | 显示播放中断并重连 |
| protocol error | 用 event ID定位，按错误类型处理 |
| rate limit/session timeout | 显示明确结束，创建新 session |
| AudioContext suspended | 用户手势恢复 |

重连不是简单复用旧 session ID。要决定：对话历史如何恢复、上一响应是否完成、旧 track 是否 stop、短期凭据是否过期、工具是否仍在执行。

### 安全与隐私

音频比文本更敏感：可能包含旁人声音、环境信息、身份特征和私密内容。

#### 必须明确

- 何时开始/停止采集，始终有可见指示；
- 原始音频、转录、摘要分别是否保存；
- 保存目的、位置、保留期和删除方式；
- 第三方模型/转录/监控服务会接收什么；
- 未成年人、通话录音和地区法律要求；
- 用户是否能关闭录音、改用文字或删除历史。

#### 技术边界

- HTTPS 与 Permissions Policy限制嵌入页面能力；
- 长期 API Key 只在可信后端；
- 短期 session 也要绑定用户、用途、模型、时长和限额；
- 工具调用仍逐项授权，声音说“同意”不自动等于高风险法律确认；
- transcript、tool arguments 和模型文字都按不可信输入渲染；
- 日志默认记录时序、错误码和统计，不记录原始 PCM；
- 录音下载 URL必须鉴权、短期且不可猜测。

麦克风权限是浏览器能力授权，不是业务同意书，也不代表用户同意长期保存或训练用途。

### 多模态扩展

语音会话可能同时包含：

- live audio；
- transcript；
- 图片/摄像头帧；
- 屏幕共享；
- 工具卡片与地图；
- 文本输入/快捷按钮。

不要把所有模态塞进一个 `message.content: string`。使用有类型的 timeline item，并明确每个 item：来源、时间、状态、权限、是否持久化、与 response/tool 的关联。

摄像头和屏幕共享必须独立申请与停止。用户允许麦克风不等于允许摄像头；上传单张图片也不等于持续视频采集。

#### 时间线同步

音频、字幕、图片和控制事件可能不同步。用服务端 item ID、event ID 和媒体时钟关联，不用 `Date.now()` 猜测精确同步。需要帧级同步的场景应采用专门媒体时间戳与容器协议。

## 用框架边界与验证支撑生产运行

语音对象大多不可序列化、依赖浏览器生命周期，也需要严格释放。最后这一层把命令式媒体资源留在 service，把可渲染状态交给 Vue/React，并用测试和预算约束长期运行。

### 框架集成

推荐边界：

```text
VoiceSessionService
  owns: MediaStream, PeerConnection, DataChannel, AudioContext, timers
  emits: typed actions + transcript events + metrics

Vue/React Store
  owns: serializable VoiceSessionState, transcript, user preferences

Components
  own: focus, local menu, visual controls
```

不要把 `MediaStream`、PeerConnection 塞进需要序列化/持久化的 Pinia/Redux state；保存句柄的 service/ref 与保存 UI 状态的 store 分开。

组件重复 mount、路由切换和 HMR 都可能触发重复申请。连接 service 应具有幂等 `connect`/`dispose`，并由真正的会话边界拥有。

### 可访问性与替代路径

- 开始、静音、结束、PTT 都是原生 button，可用键盘；
- 状态不能只靠波形/颜色，提供“正在听”“正在回答”等文本；
- 字幕默认可用，可调整大小和对比度；
- 重要工具结果同时有视觉卡片和文本摘要；
- 不强迫用户发声，始终支持文字输入；
- 不强迫用户听声音，允许静音并阅读字幕；
- PTT 除按键外提供触摸/点击路径，避免需要持续按住的唯一交互；
- 自动播放失败时提供明确恢复按钮；
- reduced motion 下关闭连续装饰动画；
- 错误通知不逐事件轰炸 live region。

语音是输入/输出增强，不应成为访问产品的唯一门槛。

### 测试策略

#### 纯逻辑

- 状态机合法/非法转换与终态；
- supplier event adapter runtime validation；
- partial/final transcript upsert 与迟到事件；
- PCM 裁剪、端点、NaN/非有限输入策略；
- 打断的 item ID、played duration 和清理；
- stats delta 与零分母。

#### 浏览器集成

真实设备难以在 CI稳定提供，可注入 fake MediaStream/track、exchangeOffer 与 RTC adapter。验证：

- 权限 pending、拒绝和 granted；
- track mute/stop 与 UI 文案；
- DataChannel open 前禁止发送；
- remote track 到达后绑定 audio；
- autoplay reject；
- speech_started 打断 assistant；
- dispose 后全部资源释放。

#### E2E 与真实设备矩阵

至少覆盖目标 Chrome/Safari/Firefox、桌面/移动、内置麦克风、USB、蓝牙、耳机和扬声器。测试：

- 首次/已授权/已拒绝权限；
- 设备插拔与切换；
- Wi-Fi ↔ 蜂窝/网络抖动；
- 锁屏、后台、来电/系统音频中断；
- 嘈杂、轻声、长停顿、连续说话；
- 打断延迟与回声；
- 字幕、键盘和读屏器。

#### 音频质量与 AI Evals

- 浏览器测试证明媒体和状态正确；
- 音频测试集衡量转录、VAD、口音、噪声和延迟；
- 对话 eval衡量轮次、打断后上下文和工具行为；
- 人工评测关注自然度、抢话、回声和信任。

随机播放一个 WAV 得到响应不等于生产语音体验通过。

### 性能与容量治理

- RAF 音量采样只在界面可见且会话活动时运行；
- stats 1~5 秒采样通常足够，不逐帧调用；
- AudioWorklet 与主线程之间批量传输，队列有上限；
- transcript partial 合并，不保留每个字符版本；
- 波形 ring buffer 有固定长度；
- 工具和图片不阻塞实时音频回调；
- hidden 页面降低可视化频率，但按产品策略决定是否维持会话；
- session 有最大时长、空闲超时和重连预算；
- 长对话管理上下文与 token，不把原始音频无限保留。

低延迟不是只追求最小缓冲。缓冲太小在抖动网络下会断音；应在延迟和稳定性间用真实设备数据取舍。

## 渐进落地与上线审查

若产品目前只有文字聊天，最稳妥的路线不是直接追求全双工，而是先让用户明确控制一轮录音，再逐步减少等待和增加自然打断。每一阶段都要保留字幕、停止和文字降级。

### 常见失败模式

#### 页面加载立即申请麦克风

用户不理解用途，权限易拒绝。由明确操作触发并给出文字替代。

#### mute 等于 stop

`enabled=false` 与 `stop()` 生命周期不同。UI 文案、隐私指示和清理必须匹配。

#### 音量阈值就是 VAD

能量不能理解语义，噪声会误触发。使用服务端 VAD 或 PTT，并允许调节/降级。

#### WebRTC 与 WebSocket 共用同一打断代码

两者播放缓冲所有权不同。WebRTC/SIP 服务器可自动截断；WebSocket 客户端必须维护播放位置。

#### 停止 audio 就算完成打断

会话仍含未播放文本，下一轮上下文错误。同步生成、播放和 conversation timeline。

#### 每次 render 新建 PeerConnection

导致重复权限、连接和资源泄漏。连接由稳定 service/Provider 拥有。

#### 日志上传完整 transcript 和 PCM

扩大隐私与安全面。默认只记录脱敏时序、错误和质量指标。

#### 字幕 partial 不断 append

内容重复、DOM增长且读屏器失控。按 segment ID替换，final 后拒绝迟到 partial。

#### 忽略自动播放失败

模型已生成但用户听不到。处理 `play()` rejection 并提供恢复 UI。

#### 长期 API Key 放进浏览器

任何前端秘密都会泄露。使用后端 SDP代理或受限短期凭据。

### 渐进落地路线

#### 阶段一：可靠 PTT

- 明确权限说明与文字替代；
- PTT 录音、请求式转录/回答/TTS；
- 字幕、取消、错误和资源清理；
- 延迟与质量基线。

#### 阶段二：WebRTC 实时会话

- 后端 session 边界；
- typed state machine + adapter；
- remote audio、DataChannel、VAD；
- stats、设备切换、重连与隐私治理。

#### 阶段三：自然双工与多模态

- barge-in 与 timeline 截断；
- semantic VAD/PTT 可切换；
- 工具审批、图像/屏幕输入；
- 长时间、噪声、真实设备 eval；
- 成本、灰度和安全运营。

先让用户始终能停止、看字幕和改用文字，再追求“像真人一样自然”。

### 上线检查清单

- [ ] 麦克风由明确用户操作申请，HTTPS 与 Permissions Policy 正确；
- [ ] denied、pending、missing、busy 都有可恢复 UI；
- [ ] mute 与 stop 语义、文案和隐私指示一致；
- [ ] MediaStream、Track、AudioContext、PeerConnection 所有权明确；
- [ ] 长期 API Key 只在后端，session 权限和时长受限；
- [ ] 媒体与控制通道分离，不假设同一时间线；
- [ ] 状态机覆盖 permission、connection、turn、response 和终态；
- [ ] VAD 可调并有 PTT/文字降级；
- [ ] WebRTC 与 WebSocket 打断策略分别实现；
- [ ] partial/final transcript 分离，打断后上下文正确；
- [ ] autoplay、设备切换、track ended、ICE failed 已处理；
- [ ] 字幕、键盘、触摸、读屏器和 reduced motion 已验证；
- [ ] 原始音频/转录的同意、用途、保留和删除策略明确；
- [ ] getStats、端到端时延和资源泄漏可观测；
- [ ] 测试包含噪声、长停顿、回声、打断、网络切换和真实设备；
- [ ] 会话、队列、上下文、重连和成本均有预算上限。

## 总结

成熟实时语音前端是一套媒体系统，而不是录音按钮：

- getUserMedia 管理敏感设备授权，Track 管理真实采集生命周期；
- Web Audio 负责分析与本地处理，AudioWorklet 承担实时 DSP；
- WebRTC 负责低延迟媒体，DataChannel 负责语义控制；
- 状态机把权限、连接、轮次、响应和打断变成可验证转换；
- VAD/PTT 决定用户什么时候说完，Barge-in 同步听觉、生成和会话时间线；
- 字幕是可修订数据，不是音频播放位置的精确代理；
- stats、设备矩阵、可访问性和隐私治理决定产品能否真正上线。

只有在用户随时能理解“谁在听、谁在说、怎样停止、数据去了哪里”时，低延迟与自然语音才有意义。

下一节：[前端文件上传、媒体资产处理与大文件传输架构](./frontend-file-upload-media-assets-and-large-file-transfer-architecture.md)，会把本课的媒体生命周期继续扩展到文件选择、分片上传、断点续传、校验和资产处理流水线。

## 参考资料

- [MDN：MediaDevices.getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN：MediaStreamTrack](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack)
- [MDN：Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN：Background audio processing using AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
- [MDN：RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
- [MDN：RTCPeerConnection.getStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats)
- [WebRTC Specification](https://w3c.github.io/webrtc-pc/)
- [OpenAI：Realtime and audio](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI：Realtime API with WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)
- [OpenAI：Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations)
- [OpenAI：Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad)
