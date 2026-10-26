# 浏览器依赖

本目录保存固定版本的发行文件，网站运行不需要构建，也不从 CDN 加载代码。

| 文件 | 来源与版本 | 许可 |
| --- | --- | --- |
| `vexflow.js` | VexFlow 4.2.5 | MIT，见 `VexFlow-LICENSE.txt` |
| `tf.min.js` | `@tensorflow/tfjs` 3.21.0，原始发行文件来自 `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js` | Apache 2.0，见 `TensorFlow-LICENSE.txt` |
| `basic-pitch.js` | `@spotify/basic-pitch` 1.0.1 的 `esm/toMidi.js` | Apache 2.0，见 `BasicPitch-LICENSE.txt` |
| `model/model.json`、`model/group1-shard1of1.bin` | `@spotify/basic-pitch` 1.0.1 npm 包中的模型文件 | Apache 2.0，见 `BasicPitch-LICENSE.txt` |

Basic Pitch 官方包地址为 `https://registry.npmjs.org/@spotify/basic-pitch/-/basic-pitch-1.0.1.tgz`，包版本提交为 `16d4c6a68e2c070726ba7c26a64c13eab4a434c4`。

本地 `basic-pitch.js` 将模块导出改为浏览器全局对象，并移除未使用的 MIDI 文件导出及相应的 `@tonejs/midi` 依赖，音符后处理算法保留。`js/transcribe.js` 自行按官方窗口尺寸运行模型，保持单声道 22050 Hz 输入，逐窗口显式释放张量，避免上游 `evaluateModel()` 未释放临时张量导致的持续内存增长。仅请求音高帧和起音输出，不请求不用的音高弯曲轮廓。关闭可选的 melodia 后处理，避免长录音的反复全矩阵搜索，可能漏掉较弱且起音不清晰的音。因此界面必须保留实验识别说明。

模型权重和运行库的许可证、第三方版权声明须随文件保留。
