# 手机视奏网站技术调研

核查日期：2026 年 10 月 25 日。下列技术来源都是网页或源代码，没有 PDF 页码。用章节名称、接口名称或文件路径定位。技术选型和产品建议明确标作本项目判断，不冒充浏览器承诺。

## 输入方式与复调识别

| 方案 | 已核实的能力 | 对本项目的判断 |
| --- | --- | --- |
| Spotify Basic Pitch | 支持复调和多种乐器，官方建议一次只处理一种乐器。TypeScript 实现使用 TensorFlow.js，可以输出音高、起音和结束时间。来源：[官方仓库 README](https://github.com/spotify/basic-pitch-ts)，Usage 和 About，无页码。 | 双手弹同一架钢琴属于合理输入。优先作为录完后分析的实验功能，不宣称手机实时评分。 |
| Basic Pitch 的输入 | 源代码要求单声道、每秒 22050 个采样点，按窗口推理。来源：[官方 inference.ts](https://github.com/spotify/basic-pitch-ts/blob/main/src/inference.ts)，`evaluateModel`、`AUDIO_SAMPLE_RATE`，无页码。 | 应采集实际设备音频，再混成单声道并重采样。不能只改采样率标签。可把版本固定的运行库和模型放入同源静态资源，缓存后离线推理。 |
| Magenta Onsets and Frames | 为复调钢琴转录设计，有 TensorFlow.js 浏览器版本。官方示例可以读取文件或麦克风录音。来源：[模型介绍](https://magenta.tensorflow.org/onsets-frames)、[浏览器实现](https://magenta.tensorflow.org/oaf-js)、[录音示例](https://magenta.github.io/magenta-js/music/demos/transcription.html)，无页码。 | 是合理的钢琴专用对照模型。需要另测下载量、内存、耗时和目标手机效果，不能仅因钢琴专用就假定更适合当前设备。 |
| CREPE、YIN 一类单音检测 | CREPE 官方定义为单音基频跟踪，输出一个随时间变化的基频。来源：[CREPE 官方 README](https://github.com/marl/crepe)，无页码。 | 一个基频不能表示左手低音和右手和弦的同时发声，不能用于完整双手判错。将频谱最高峰当作所有弹奏音符同样不足。可以用于单音校音或输入诊断。 |
| Web MIDI | 浏览器可接收硬件的 MIDI 消息。协议接口提供设备和事件，不提供完整乐谱评分。来源：[W3C Web MIDI](https://www.w3.org/TR/webmidi/)，Introduction、MIDIInput、MIDIMessageEvent，无页码。 | 可直接获得按键事件，省去声学识别。它是音高和起音判定的首选输入，但连接、事件遗漏和延迟仍须测试。力度值不等于听觉响度，松键时间也不等于踏板延音后的声音结束。 |

Basic Pitch 的论文摘要说明了低资源复调转录的研究结果，但没有提供“任意 iPhone 麦克风加任意家庭钢琴”的准确率保证。论文评测结果不能直接转成这款练习软件的正确率。来源：[作者论文摘要](https://arxiv.org/abs/2203.09893)，无页码。本项目因此不标注未经实测的百分比。

## Safari 与 MIDI 的真实边界

截至核查日期，macOS Safari 和 iOS Safari 都没有原生 Web MIDI。WebKit 的实现任务仍为未完成状态，MDN 的兼容性数据也将 Safari 标为未支持，iOS Safari 继承该状态。来源：[WebKit 107250](https://bugs.webkit.org/show_bug.cgi?id=107250)、[MDN MIDIAccess 原始兼容性数据](https://github.com/mdn/browser-compat-data/blob/main/api/MIDIAccess.json)，无页码。

桌面 Chrome 和 Edge 可作为电钢琴直连路径，Firefox 桌面也实现了接口。仍需系统驱动、设备和用户权限可用。来源：[MDN Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)、[requestMIDIAccess](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess)，Browser compatibility、Security requirements，无页码。

本项目判断：页面以 `typeof navigator.requestMIDIAccess === 'function'` 检测能力。不存在时清楚提示改用麦克风、手动复盘或支持该接口的电脑浏览器。不能把换成 iPhone 上的另一个浏览器名称当作可用保证，也不能把第三方扩展提供的桥接当作 Safari 原生支持。普通用户不应看到无法成功的“连接 MIDI”权限循环。

## iPhone 麦克风采集

1. `getUserMedia` 需要安全上下文和用户授权。HTTPS 和 localhost 适合使用，手机访问电脑的普通局域网 HTTP 地址不能据此保证麦克风可用。权限被拒绝、设备被占用和无输入都应有明确提示。来源：[MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)，Privacy and security、Exceptions，无页码。
2. 请求关闭 `echoCancellation`、`noiseSuppression`、`autoGainControl`，并请求单声道。规范分别定义了回声消除、降噪和自动增益，支持情况必须读取能力或设置，不能把“传了 false”写成“设备已全部关闭”。来源：[W3C Media Capture](https://www.w3.org/TR/mediacapture-streams/)，4.3.5、4.3.6、4.3.7、4.3.8，无页码。
3. `getSupportedConstraints()` 反映接口支持，`getSettings()` 反映实际选中的轨道设置。若某项没有返回，就显示“浏览器未报告”，不是擅自标为关闭。来源：[MDN getSettings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)、[采样率约束](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/sampleRate)，无页码。
4. 不能假定 iPhone 恒为 44100 Hz、48000 Hz，或者能按请求直接获得 22050 Hz。输入轨道设置和 Web Audio 处理缓冲的采样率应分别读取，重采样按实际缓冲处理。来源：[BaseAudioContext.sampleRate](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/sampleRate)、[Basic Pitch 输入约束](https://github.com/spotify/basic-pitch-ts/blob/main/src/inference.ts)，无页码。
5. WebKit 支持 MediaRecorder，但容器和编码要运行时检测。官方说明建议用 `MediaRecorder.isTypeSupported()` 选择格式。来源：[WebKit MediaRecorder](https://webkit.org/blog/11353/mediarecorder-api/)，无页码。本项目判断：如果直接保存 PCM/WAV，则可绕过不同录音容器的解码差异，代价是录音占用更多内存。
6. WebKit 的媒体采集需要用户明确授权，并显示采集状态。来源：[WebKit WebRTC 说明](https://webkit.org/blog/7763/a-closer-look-into-webrtc/)，Security Origin Policy for Media Capture，无页码。本项目判断：只在用户点击开始后开启输入，结束或离开页面时停止轨道。不要默认后台持续录音。

本项目判断：关闭上述语音处理是为了尽量保留钢琴泛音、起音和动态。录音时关闭网页示范和扬声器节拍器，避免把提示音判成琴音。戴耳机也需要真机检查实际输入路由。遇到没有报告设置、明显削波、噪声大或采样中断时，给出低可信提示，保留录音供回听，不给出确定的错音结论。

播放恢复按相邻 `../scales/js/audio.js` 的已有实现沿用：页面隐藏或 AudioContext 中断时停止调度并标记过期，回到前台后的第一次点击重建 AudioContext。仅调用 `resume()` 不足以覆盖“状态为 running 但时钟不走”这一已有防护场景。此项依据本地代码检查，不是对本网站已完成 iPhone 真机测试的声明。

## 对齐与反馈设计

DTW 可以把不同速度的时间序列映射到共同的音乐位置，音乐同步通常先提取特征，再进行动态规划对齐。传统离线 DTW 使用完整的两段数据，在线跟谱是另一种问题。来源：[AudioLabs 音乐同步教程](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C3/C3_MusicSynchronization.html)、[DTW 算法](https://www.audiolabs-erlangen.de/resources/MIR/FMP/C3/C3S2_DTWbasic.html)，无页码。

本项目采用以下可测方案。这是工程设计，不是 ABRSM 评分公式。

1. 谱面保存稳定音符 ID、MIDI 音高、手别、拍位置和时值。多个同时起音的音符组成一个和弦事件，不能把和弦各音按串行音符对齐。
2. MIDI 按起音聚组。麦克风先转录为候选音符，再按时间聚组，保留来源和置信信息。
3. 使用带插入、删除、替换成本的动态规划，音高集合相似度和时间差共同参与代价。短题可以在录完后完成，无需把实时游标与错误判断绑在一起。
4. 匹配和弦内共同音为命中。不同音配为疑似错音，未匹配谱面音为疑似漏音，未匹配演奏音为疑似多弹。多弹音在最近的谱面事件旁加标记，不凭空把它画成一个谱面音。
5. 起奏等待不算节奏错误。拟合整体起点和速度后，另外报告全曲速度偏差、局部相邻起音间隔偏差和停顿。不能让 DTW 把中途停顿完全拉平后宣称节奏正确。
6. 长音和写出的休止不应误判为停顿。停顿应依据预期下一起音与实际下一起音之间的超额等待，并结合当地速度，阈值是练习参数。
7. 重复乐句、整小节漏弹和重新开始可能造成多条合理匹配路径。对齐质量低时提示“暂时无法可靠定位”，避免整页错误颜色造成误导。
8. 单元测试必须覆盖全对、替换一个音、和弦漏一个音、多一个音、整体变慢、局部拖拍、中途停顿、提前结束和空输入。不能只验证理想等距单音序列。

## 大谱表渲染比较

| 工具 | 官方能力与来源 | 本项目取舍 |
| --- | --- | --- |
| VexFlow | SVG 和 Canvas 乐谱渲染，`StaveNote.setKeyStyle()` 可以给和弦中的指定音头着色。来源：[官方 API](https://vexflow.github.io/vexflow-docs/api/5.0.0/classes/StaveNote.html)，`setKeyStyle`、`setContext`，无页码。 | 最适合直接从自有音符模型生成短题并保存音头映射。自己安排每行小节和系统宽度，避免仅缩小整页导致手机难读。推荐选用。 |
| abcjs | ABC 字符串生成 SVG，支持 `responsive`、`wrap`、元素 class 和选择回调。来源：[renderAbc 参数](https://docs.abcjs.net/visual/render-abc-options)、[元素选择](https://docs.abcjs.net/visual/dragging)，无页码。 | 文本生成简单，大谱表可以表达。但 `responsive: resize` 只是整体缩放，逐个和弦音头的映射需要额外检查。适合快速文本曲谱，不是本项目最直接的逐音反馈模型。 |
| OpenSheetMusicDisplay | 读取 MusicXML，以 VexFlow 排版，支持 SVG、自动重排、颜色和深色选项，图形音符提供着色能力。来源：[官方 README](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay)、[ColoringOptions](https://opensheetmusicdisplay.github.io/classdoc/interfaces/ColoringOptions.html)、[OSMDOptions](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/src/OpenSheetMusicDisplay/OSMDOptions.ts)，无页码。 | 适合导入已有 MusicXML。这里只生成短题，增加 XML 中间层和复杂对象模型的收益有限。 |
| Verovio | 有预编译 WebAssembly 浏览器版本，生成的 SVG 保留 MEI 的结构和 `xml:id`，可以 CSS 或脚本着色。来源：[JavaScript 与 WebAssembly](https://book.verovio.org/installing-or-building-from-sources/javascript-and-webassembly.html)、[CSS 与 SVG](https://book.verovio.org/interactive-notation/css-and-svg.html)，无页码。 | 排版能力成熟，稳定 ID 很适合交互。代价是 WASM、MEI 数据和初始化管理，适合未来需要更完整刻谱或交换格式时采用。 |

本项目判断：渲染库的已编译发行文件可以固定版本存入仓库，随 service worker 缓存，不要求用户运行构建。使用 SVG 和每行重排，手机以一至两个小节为基本单元。错误除了颜色还提供图例和文字列表。深色模式给谱线、音头、背景和错误色分别指定对比度，不直接整张反色。

## 准确率与诚实呈现

目前没有本项目在真实 iPhone、真实钢琴、不同房间中的标注测试集，因此无法回答一个可信的“实际准确率百分之几”。合成音符数据只能验证对齐和判错算法，不能证明麦克风转录准确。模型论文也不构成本设备验证。该限制应直接显示在麦克风功能旁。

建议的界面行为是本项目设计：

- MIDI 结果标“按键事件反馈”，麦克风结果标“实验识别，需回听核对”，手动记录标“自评”。历史统计分别保存来源。
- 模型置信度未经校准，不能写成“百分之九十五肯定弹错”。低可信事件使用浅色或虚线和“待核对”，不自动累积为确定弱项。
- 对疑似错音、漏音、多弹、节奏偏差和停顿显示小节位置及解释。保留原录音回听，识别失败时允许继续自评。
- 自动反馈覆盖音高、起音和连贯性的部分线索。音色、乐句呼吸、力度层次、踏板质量、风格等需要听觉判断，不能用 MIDI velocity 或音量峰值替代官方音乐表现评价。
- 不生成 ABRSM 官方分数或官方等级。可以借用拍子、节奏、音高、连贯性和音乐细节等维度给练习建议，明确是练习参考。

实际验证应至少包含：真机权限拒绝后恢复、锁屏后首次点击播放、切换前后台、手机扬声器与耳机输入、双手和弦、弱音、连奏、休止、踏板、模型冷启动、离线缓存、长录音内存和耗时。桌面无头浏览器截图通过仅能证明布局与部分浏览器行为，不能代替这些测试。

## 本次落地选择

实际实现采用 AudioWorklet 收集 PCM，必要时合并输入声道，在本机生成 WAV 供回听和下载，没有依赖 MediaRecorder 的容器选择。录音上限为三分钟，准备阶段只检查输入，收到正式开始指令后才保留采样。页面隐藏、输入轨道结束或暂停时停止本次会话。源码见 [input.js](../js/input.js) 和 [recorder-worklet.js](../js/recorder-worklet.js)。

播放和录音还要切换音频会话用途。W3C Audio Session 草案把麦克风轨道的默认类型定义为 `play-and-record`，并要求显式类型为 `play-and-record` 或 `auto`。因此，之前为示范播放设置的 `playback` 不应留给录音流程。来源：[W3C Audio Session](https://www.w3.org/TR/audio-session/)，第 3.1、6.3、9.1 节，无页码。此接口仍属实验性能力，代码先检测支持，再在创建录音上下文和申请麦克风前设置 `play-and-record`。结束或取消时由持有设置的会话恢复 `auto`，过期会话不能覆盖新会话。播放器每次点击恢复 `playback`。这些设置可能改变手机音频路由或音量，软件测试只验证设置顺序与取消后的状态，尚未在真实 iPhone 上验证播放后立刻录音、录音后再次播放和耳机切换。

模型采用 `@spotify/basic-pitch` 1.0.1 与 TensorFlow.js 3.21.0，使用本地资源。默认尝试 WebGL，无法启用时使用 CPU。以 OfflineAudioContext 重采样到 22050 Hz，无法使用时才回退到带低通滤波的本地重采样。逐窗口运行模型并释放临时张量，录完后分析。后处理关闭了反复搜索整段能量矩阵的可选 melodia 步骤，可能漏掉弱起音，换取较可控的手机运行成本。谱面采用本地 VexFlow 4.2.5。版本和改动见 [依赖说明](../vendor/DEPENDENCIES.md)。

返回的 `confidence` 实际是音符持续期间的平均帧激活值，不是经过校准的置信概率。全部麦克风反馈都必须使用疑似或待核对措辞。对齐、节奏阈值和颜色仅是练习辅助。

本机已执行合成三秒 C4、E4、G4 和弦的真实模型测试，三个目标起音均被检测到，同时仍出现额外高音及长音分段。连续两次 CPU 推理结束后的常驻张量数均为 245，没有在这两次测试中增长。这证明本地模型可以运行并回收该路径的临时张量，不证明钢琴录音准确率，也不证明长时间内存稳定。可复现测试见 [transcribe.test.js](../tests/transcribe.test.js)。

输入算法测试还核查了 WAV 编码、重采样保留 440 Hz 与抑制超出目标奈奎斯特频率的信号、MIDI 和弦与重复按键、准备音排除和录音上限。生命周期测试核查取消后迟到的麦克风或 MIDI 权限、并发结束与重新开始，以及下载模型期间取消。它们都是软件模拟，真实 iPhone 麦克风、锁屏恢复和物理 MIDI 设备尚未验证。
