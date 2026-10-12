# 第三方素材声明 (NOTICE)

## 人体几何数据（MuscleMap）

`src/data/body-paths.json` 中的人体 SVG 路径数据转换自
[**MuscleMap**](https://github.com/melihcolpan/MuscleMap)，作者 Melih Colpan，
基于 **MIT License** 授权使用。原始项目以 Swift 源码形式分发路径数据，
本仓库的 JSON 由 [openGym](https://github.com/DuarteSantos8/openGym)
（AGPL-3.0）的转换结果经 `scripts/vendor-body-paths.mjs` 提取男体正面/背面两个视图生成。

MIT License 授权声明（原文）：

> Copyright (c) Melih Colpan
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

GymGym 其余代码（MIT）与上述数据相互独立；本仓库整体按 LICENSE 文件的 MIT 协议分发。
