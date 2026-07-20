---
title: 线性组合、线性变换、基与矩阵乘法
description: 从空间变换理解矩阵、基、列空间、秩、零空间与变换复合
outline: deep
---

# 线性组合、线性变换、基与矩阵乘法

> 本课承接“标量、向量、矩阵与张量”，讨论稳定的线性代数原理。示例使用 Python 标准库，不依赖数值框架版本。

## 1. 学习目标

完成本节后，你应该能够：

- 从“加权相加”和“空间变换”两个角度解释矩阵乘向量。
- 准确定义线性组合、张成空间、线性无关和基。
- 判断一个变换是否为线性变换，并区分线性变换与仿射变换。
- 解释矩阵的列、列空间、秩和零空间分别代表什么。
- 用变换复合解释矩阵乘法，并判断乘法顺序。
- 理解换基只改变坐标描述，不改变向量本身。
- 说明线性代数为什么是神经网络、Embedding 和 Attention 的共同底层语言。

## 2. 从上一课的公式继续

上一课介绍了：

\[
\mathbf{y}=\mathbf{W}\mathbf{x}+\mathbf{b}
\]

如果只看计算步骤，\(\mathbf{W}\mathbf{x}\) 是“每一行和输入做点积”。这完全正确，但还不够深入。

矩阵还可以看成一个**空间变换**：它接收一个向量，改变其方向、长度和所处空间的维数，再输出新向量。理解这一层之后，矩阵乘法、降维和神经网络投影便不再是零散公式。

本课先暂时忽略偏置，研究：

\[
\mathbf{y}=\mathbf{A}\mathbf{x}
\]

最后再把 \(\mathbf{b}\) 放回来，解释为什么它会让变换从“线性”变成“仿射”。

## 3. 线性组合：线性代数最基本的动作

给定向量 \(\mathbf{v}_1,\mathbf{v}_2,\ldots,\mathbf{v}_k\) 和标量 \(c_1,c_2,\ldots,c_k\)，表达式：

\[
c_1\mathbf{v}_1+c_2\mathbf{v}_2+\cdots+c_k\mathbf{v}_k
\]

称为这些向量的一个**线性组合**。它只做两件事：

1. 用标量缩放每个向量；
2. 把缩放后的向量相加。

例如：

\[
2
\begin{bmatrix}1\\0\end{bmatrix}
+3
\begin{bmatrix}0\\1\end{bmatrix}
=
\begin{bmatrix}2\\3\end{bmatrix}
\]

二维平面中的任意向量都能由水平方向 \([1,0]^{\mathsf T}\) 和垂直方向 \([0,1]^{\mathsf T}\) 线性组合得到。

### 3.1 张成空间

一组向量所有可能线性组合构成的集合称为它们的**张成空间**（span）：

\[
\operatorname{span}(\mathbf{v}_1,\ldots,\mathbf{v}_k)
=
\left\{
\sum_{i=1}^{k}c_i\mathbf{v}_i
\mid c_i\in\mathbb{R}
\right\}
\]

直觉上，span 回答的是：**只使用这些方向，通过任意缩放和相加，能够到达哪些位置？**

- 一个非零二维向量通常张成一条过原点的直线；
- 两个不共线的二维向量张成整个二维平面；
- 三个共面的三维向量仍然只能张成一个平面。

张成空间一定包含零向量，因为所有系数都取 0 即可得到零向量。

### 3.2 向量空间与子空间

向量空间不是“装向量的数组”，而是一组可以进行向量加法和标量乘法，并且运算后仍留在集合中的对象。严格定义还要求零向量、加法逆元、结合律和分配律等公理成立。

如果一个集合位于更大的向量空间中，并且自身也满足向量空间的全部条件，它就是一个**子空间**。在实数向量空间中，可以用三个条件快速检查候选集合：

1. 包含零向量；
2. 对向量加法封闭；
3. 对标量乘法封闭。

过原点的直线和平面可以是子空间；不经过原点的平行直线或平面不是子空间。后面出现的列空间和零空间都是子空间。

## 4. 线性无关与基

如果存在不全为 0 的系数，使得：

\[
c_1\mathbf{v}_1+\cdots+c_k\mathbf{v}_k=\mathbf{0}
\]

那么这组向量**线性相关**；如果只有 \(c_1=\cdots=c_k=0\) 才能得到零向量，则它们**线性无关**。

直觉上，线性相关意味着至少一个向量可以由其他向量拼出来，因此它没有提供新的方向。

例如：

\[
\mathbf{v}_1=
\begin{bmatrix}1\\2\end{bmatrix},
\quad
\mathbf{v}_2=
\begin{bmatrix}2\\4\end{bmatrix}
\]

因为 \(\mathbf{v}_2=2\mathbf{v}_1\)，二者只代表同一条直线上的方向，是线性相关的。

### 4.1 什么是基

一个向量空间的**基**（basis）需要同时满足：

1. 能张成整个空间；
2. 彼此线性无关。

也就是说，基是一套“不重复但又足够完整”的坐标方向。二维空间的标准基是：

\[
\mathbf{e}_1=
\begin{bmatrix}1\\0\end{bmatrix},
\qquad
\mathbf{e}_2=
\begin{bmatrix}0\\1\end{bmatrix}
\]

于是：

\[
\mathbf{x}=
\begin{bmatrix}x_1\\x_2\end{bmatrix}
=x_1\mathbf{e}_1+x_2\mathbf{e}_2
\]

同一个空间可以有许多组基。基不是空间本身，而是一套描述空间中向量的坐标系统。

### 4.2 维数

一个有限维向量空间的任意一组基都包含相同数量的向量，这个数量称为空间的**维数**。

这里应继续区分：

- \(\mathbb{R}^{768}\) 的向量空间维数是 768；
- 存放一条 768 维向量的数组通常只有 1 个轴，形状为 `(768,)`。

## 5. 线性变换：保留线性组合结构

从向量空间 \(V\) 到向量空间 \(W\) 的函数 \(T:V\rightarrow W\)，如果对任意向量 \(\mathbf{u},\mathbf{v}\) 和任意标量 \(\alpha,\beta\) 都满足：

\[
T(\alpha\mathbf{u}+\beta\mathbf{v})
=
\alpha T(\mathbf{u})+\beta T(\mathbf{v})
\]

就称为**线性变换**。

它等价于同时满足：

\[
T(\mathbf{u}+\mathbf{v})=T(\mathbf{u})+T(\mathbf{v})
\]

和：

\[
T(c\mathbf{u})=cT(\mathbf{u})
\]

线性变换的核心不是“图像看起来是一条直线”，而是它保留了向量加法与标量乘法的结构。

### 5.1 线性变换一定把原点映射到原点

令 \(c=0\)，可以推出：

\[
T(\mathbf{0})=\mathbf{0}
\]

这是快速排除非线性变换的重要条件。如果一个变换把原点移动到别处，它就不是严格的线性变换。

### 5.2 常见线性变换

- 绕原点旋转；
- 沿坐标轴缩放；
- 剪切；
- 投影到一条过原点的直线或一个子空间；
- 从高维空间映射到低维空间。

平移不是线性变换，因为它会移动原点。`ReLU(x)=max(0,x)` 也不是整个实数空间上的线性变换，因为它不满足对所有标量的齐次性。

## 6. 矩阵如何表示线性变换

选定输入和输出空间的基之后，每个有限维线性变换都可以用一个矩阵表示：

\[
T(\mathbf{x})=\mathbf{A}\mathbf{x}
\]

若 \(\mathbf{A}\in\mathbb{R}^{m\times n}\)，则它把 \(\mathbb{R}^{n}\) 中的输入映射到 \(\mathbb{R}^{m}\)：

\[
T:\mathbb{R}^{n}\rightarrow\mathbb{R}^{m}
\]

这也解释了形状：矩阵有 \(n\) 列来接收 \(n\) 个输入坐标，有 \(m\) 行来产生 \(m\) 个输出坐标。

### 6.1 矩阵的列就是基向量变换后的结果

把矩阵按列写成：

\[
\mathbf{A}=
\begin{bmatrix}
\vert & \vert & & \vert \\
\mathbf{a}_1 & \mathbf{a}_2 & \cdots & \mathbf{a}_n \\
\vert & \vert & & \vert
\end{bmatrix}
\]

因为输入向量可写成标准基的线性组合：

\[
\mathbf{x}=x_1\mathbf{e}_1+\cdots+x_n\mathbf{e}_n
\]

利用线性性：

\[
T(\mathbf{x})
=x_1T(\mathbf{e}_1)+\cdots+x_nT(\mathbf{e}_n)
\]

而：

\[
T(\mathbf{e}_j)=\mathbf{A}\mathbf{e}_j=\mathbf{a}_j
\]

所以：

\[
\mathbf{A}\mathbf{x}
=x_1\mathbf{a}_1+x_2\mathbf{a}_2+\cdots+x_n\mathbf{a}_n
\]

这是理解矩阵乘向量的第二种方式：**输出是矩阵各列的线性组合，组合系数正是输入向量的坐标。**

例如：

\[
\mathbf{A}=
\begin{bmatrix}2&1\\1&2\end{bmatrix},
\qquad
\mathbf{x}=
\begin{bmatrix}3\\4\end{bmatrix}
\]

那么：

\[
\mathbf{A}\mathbf{x}
=3
\begin{bmatrix}2\\1\end{bmatrix}
+4
\begin{bmatrix}1\\2\end{bmatrix}
=
\begin{bmatrix}10\\11\end{bmatrix}
\]

上一课的“行与输入做点积”和本课的“按输入坐标组合各列”是同一次计算的两个视角。

## 7. 列空间、零空间与秩

### 7.1 列空间：这个变换能够到达哪里

所有可能输出 \(\mathbf{A}\mathbf{x}\) 构成 \(\mathbf{A}\) 的**列空间**：

\[
\operatorname{Col}(\mathbf{A})
=\{\mathbf{A}\mathbf{x}\mid\mathbf{x}\in\mathbb{R}^{n}\}
\]

由于 \(\mathbf{A}\mathbf{x}\) 是各列的线性组合，列空间就是矩阵各列张成的空间。

### 7.2 零空间：哪些输入会被压成零

满足：

\[
\mathbf{A}\mathbf{x}=\mathbf{0}
\]

的全部输入构成矩阵的**零空间**（null space）：

\[
\operatorname{Null}(\mathbf{A})
=\{\mathbf{x}\mid\mathbf{A}\mathbf{x}=\mathbf{0}\}
\]

若零空间中存在非零向量，就说明至少有某些不同输入经过变换后无法区分：若 \(\mathbf{A}\mathbf{z}=0\)，则 \(\mathbf{A}(\mathbf{x}+\mathbf{z})=\mathbf{A}\mathbf{x}\)。变换丢失了 \(\mathbf{z}\) 方向的信息。

### 7.3 秩：保留了多少独立方向

矩阵的**秩**（rank）是其线性无关列的最大数量，也等于列空间的维数：

\[
\operatorname{rank}(\mathbf{A})
=\dim(\operatorname{Col}(\mathbf{A}))
\]

对于 \(m\times n\) 矩阵：

\[
\operatorname{rank}(\mathbf{A})\le\min(m,n)
\]

秩可以直观理解为变换输出中保留下来的独立方向数量。低秩映射会把一部分方向压缩或合并，这既可能造成信息损失，也可能用于降维、压缩和低秩适配。

秩不是数组的轴数。一个二维矩阵可能秩为 1、2 或更高，具体取决于它的行列关系。

## 8. 仿射变换：线性变换后再平移

机器学习中常见的“线性层”是：

\[
f(\mathbf{x})=\mathbf{W}\mathbf{x}+\mathbf{b}
\]

当 \(\mathbf{b}\ne\mathbf{0}\) 时：

\[
f(\mathbf{0})=\mathbf{b}\ne\mathbf{0}
\]

所以它不满足严格的线性变换定义，而是**仿射变换**（affine transformation）：先做线性变换，再平移。

工程文档和日常交流仍常把它称为“线性层”或“线性模型”。这是约定俗成的名称；进行数学推导时应知道更准确的分类。PyTorch 官方文档也明确把 `torch.nn.Linear` 描述为仿射线性变换。

偏置很有用，因为模型的决策边界不必被限制为经过原点。

## 9. 矩阵乘法：连续执行两个线性变换

设第一个变换为：

\[
T_{\mathbf{B}}(\mathbf{x})=\mathbf{B}\mathbf{x}
\]

第二个变换为：

\[
T_{\mathbf{A}}(\mathbf{y})=\mathbf{A}\mathbf{y}
\]

先执行 \(\mathbf{B}\)，再执行 \(\mathbf{A}\)：

\[
T_{\mathbf{A}}(T_{\mathbf{B}}(\mathbf{x}))
=\mathbf{A}(\mathbf{B}\mathbf{x})
=(\mathbf{A}\mathbf{B})\mathbf{x}
\]

因此，乘积矩阵 \(\mathbf{A}\mathbf{B}\) 表示两个变换的复合。

### 9.1 顺序从右向左读

\[
\mathbf{A}\mathbf{B}\mathbf{x}
\]

表示先用 \(\mathbf{B}\) 变换 \(\mathbf{x}\)，再用 \(\mathbf{A}\) 变换结果。矩阵乘法通常不满足交换律：

\[
\mathbf{A}\mathbf{B}\ne\mathbf{B}\mathbf{A}
\]

例如“先旋转再沿横轴缩放”通常不同于“先缩放再旋转”。

### 9.2 形状来自接口连接

若：

\[
\mathbf{B}\in\mathbb{R}^{p\times n},
\qquad
\mathbf{A}\in\mathbb{R}^{m\times p}
\]

那么：

\[
\mathbf{A}\mathbf{B}\in\mathbb{R}^{m\times n}
\]

内维 \(p\) 必须相同，因为 \(\mathbf{B}\) 输出 \(p\) 个坐标，而 \(\mathbf{A}\) 正好接收 \(p\) 个坐标。

矩阵乘法满足结合律：

\[
(\mathbf{A}\mathbf{B})\mathbf{C}
=\mathbf{A}(\mathbf{B}\mathbf{C})
\]

数学结果相同，但在计算机中，不同结合顺序的运算量、内存占用和浮点舍入误差可能不同。

## 10. 换基：向量没变，坐标变了

假设使用一组新基 \(\mathbf{p}_1,\ldots,\mathbf{p}_n\)，把这些基向量作为列组成：

\[
\mathbf{P}=
\begin{bmatrix}
\vert&&\vert\\
\mathbf{p}_1&\cdots&\mathbf{p}_n\\
\vert&&\vert
\end{bmatrix}
\]

若向量在新基下的坐标为 \(\mathbf{c}\)，它在标准基下的坐标为：

\[
\mathbf{x}=\mathbf{P}\mathbf{c}
\]

如果 \(\mathbf{P}\) 可逆，则：

\[
\mathbf{c}=\mathbf{P}^{-1}\mathbf{x}
\]

这里没有移动真实向量，只是更换了描述它的“坐标语言”。就像同一地点可以用经纬度或局部地图坐标表示。

若讨论同一空间到自身的线性变换，它在标准基下用 \(\mathbf{A}\) 表示，在输入和输出两端都采用同一组新基时，其表示是：

\[
\mathbf{A}_{new}=\mathbf{P}^{-1}\mathbf{A}\mathbf{P}
\]

这段公式现在只需理解流程：新坐标先转成旧坐标，执行旧坐标中的变换，再把结果转回新坐标。特征向量与对角化课程会再次使用它。

## 11. 可逆性：变换能否被完全撤销

对于方阵 \(\mathbf{A}\)，若存在矩阵 \(\mathbf{A}^{-1}\) 满足：

\[
\mathbf{A}^{-1}\mathbf{A}
=\mathbf{A}\mathbf{A}^{-1}
=\mathbf{I}
\]

则 \(\mathbf{A}\) 可逆。\(\mathbf{I}\) 是恒等矩阵，对任何向量都有 \(\mathbf{I}\mathbf{x}=\mathbf{x}\)。

可逆意味着：

- 每个输出对应唯一输入；
- 零空间只有零向量；
- 矩阵满秩；
- 线性方程 \(\mathbf{A}\mathbf{x}=\mathbf{b}\) 对每个 \(\mathbf{b}\) 都有唯一解。

这些说法对方阵彼此等价。非方阵需要分别讨论左逆、右逆或伪逆，不能简单套用。

数值计算中，求解 \(\mathbf{A}\mathbf{x}=\mathbf{b}\) 通常不应先显式计算逆矩阵再相乘；直接使用线性方程求解器通常更高效、更稳定。这里体现了稳定数学结论与数值工程实践的区别。

## 12. 线性变换在 AI 中出现在哪里

### 12.1 神经网络线性层

线性层把最后一个特征轴从 \(d_{in}\) 投影到 \(d_{out}\)：

\[
\mathbf{y}=\mathbf{W}\mathbf{x}+\mathbf{b}
\]

改变 \(d_{out}\) 可以扩展、保持或压缩特征维数。

### 12.2 为什么网络需要非线性激活

若连续两层都没有偏置和非线性：

\[
\mathbf{y}=\mathbf{W}_2(\mathbf{W}_1\mathbf{x})
=(\mathbf{W}_2\mathbf{W}_1)\mathbf{x}
\]

无论叠多少层，仍等价于一个线性变换。即使包含偏置，多层仿射变换复合后仍只是一个仿射变换。

ReLU、GELU 等非线性激活让网络不能被合并成单个矩阵，从而能够表达复杂的非线性关系。

### 12.3 Embedding 与特征空间

Embedding 把离散对象映射成连续向量。向量的坐标依赖模型学习出的表示空间；单个坐标通常没有独立、固定的人类语义。模型更关心向量之间的方向、距离及经过线性投影后的关系。

### 12.4 Attention 中的投影

Transformer 会把隐藏表示投影成 Query、Key 和 Value：

\[
\mathbf{Q}=\mathbf{X}\mathbf{W}_Q,
\qquad
\mathbf{K}=\mathbf{X}\mathbf{W}_K,
\qquad
\mathbf{V}=\mathbf{X}\mathbf{W}_V
\]

这些矩阵学习的是不同的特征变换。后续 Attention 课程会继续解释 \(\mathbf{Q}\mathbf{K}^{\mathsf T}\) 如何通过点积产生相关性分数。

### 12.5 低秩方法

如果一个权重更新可以近似分解为两个较小矩阵的乘积，就能用更少参数表示它。低秩适配等工程方法建立在矩阵乘法和秩的概念之上；具体算法将在模型训练模块讲解。

## 13. 可运行示例：观察变换与复合

配套文件 `examples/ai/math/linear_transformations.py` 展示：

- 线性组合在变换前后保持一致；
- 矩阵向量乘法等于矩阵列的线性组合；
- 带偏置的仿射变换会移动零向量；
- 复合矩阵与依次执行两个变换得到相同结果；
- 交换两个矩阵通常会得到不同结果。

在仓库根目录运行：

```bash
python3 examples/ai/math/linear_transformations.py
```

核心验证对应线性变换定义：

```python
left = transform(A, add(scale(alpha, u), scale(beta, v)))
right = add(
    scale(alpha, transform(A, u)),
    scale(beta, transform(A, v)),
)

assert close(left, right)
```

这不是靠几个样本就“证明”矩阵变换一定线性；一般证明应直接利用矩阵乘法的分配律与结合律。代码的作用是把抽象定义映射到可观察的数值过程。

## 14. 读矩阵公式的固定方法

看到矩阵公式时，依次问：

1. 输入空间和输出空间分别是多少维？
2. 矩阵每一列表示哪个输入基向量变换后的结果？
3. 输出能到达哪个子空间，是否损失了某些方向？
4. 多个矩阵相乘时，变换的实际执行顺序是什么？
5. 是否存在偏置或非线性，使它不再是严格线性变换？
6. 当前使用的是数学定义、框架约定，还是具体工程布局？

这套问题可以一直用到全连接层、卷积、Embedding、Attention 和低秩分解。

## 15. 常见误解

### “矩阵只是二维数据表”

矩阵可以存储二维数据，也可以表示线性变换。两种视角都重要，但不要把“样本表的行列”与“变换矩阵的输入输出维”混为一谈。

### “线性层一定是线性变换”

名称容易误导。带非零偏置的 `Wx+b` 是仿射变换；只有偏置为零时才是严格线性变换。

### “矩阵乘法可以交换顺序”

通常不可以。`ABx` 是先执行 `B` 再执行 `A`，而 `BAx` 的接口、几何含义甚至形状都可能不同。

### “列数越多，秩就越高”

不一定。重复列或能由其他列线性组合得到的列不会增加秩。秩统计的是独立方向，而不是列的总数。

### “降维一定只是删除几个坐标”

不一定。线性降维可以把所有输入坐标混合成较少的新坐标。删除列只是许多映射方式中的一种。

### “换基改变了向量”

换基改变的是坐标描述。向量所代表的几何对象不变，正如同一地点可以有不同坐标表示。

## 16. 稳定原理、版本行为与工程实践

| 类型 | 本课示例 | 应该如何对待 |
| --- | --- | --- |
| 稳定原理 | 线性性、基、秩、零空间、变换复合 | 长期掌握 |
| 版本行为 | `matmul` 对高维输入的广播规则、框架 API | 查对应版本官方文档 |
| 工程实践 | 显式求逆还是直接求解、矩阵链计算顺序 | 结合稳定性和性能选择 |

NumPy 的 `matmul`/`@` 对二维数组实现传统矩阵乘法，但对一维和高维数组还有提升维度及批次广播规则。那些属于具体 API 行为，将在 NumPy 课程按版本讲解。

## 17. 本课小结

- 线性组合由缩放和相加组成；一组向量的所有线性组合构成其张成空间。
- 基是一组线性无关且能张成整个空间的向量，为向量提供坐标系统。
- 线性变换保留线性组合结构，并且一定把零向量映射到零向量。
- 矩阵的第 \(j\) 列是第 \(j\) 个基向量变换后的结果，\(\mathbf{A}\mathbf{x}\) 是各列按输入坐标形成的线性组合。
- 列空间描述所有可能输出，零空间描述被压成零的输入方向，秩描述保留的独立方向数。
- `Wx+b` 在偏置非零时是仿射变换；神经网络还需要非线性激活提升表达能力。
- 矩阵乘法表示变换复合，顺序从右向左读，通常不能交换。
- 换基只更换坐标系统，不改变向量本身。

下一课将学习向量长度、距离、夹角、正交与余弦相似度，为最近邻、Embedding 检索和 Attention 点积打基础。

## 18. 参考资料

- [MIT OpenCourseWare 18.06：Linear Algebra](https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/)
- [Goodfellow、Bengio 与 Courville：《Deep Learning》第 2 章](https://www.deeplearningbook.org/contents/linear_algebra.html)
- [NumPy：`numpy.matmul`](https://numpy.org/doc/stable/reference/generated/numpy.matmul.html)
- [PyTorch：`torch.nn.Linear`](https://docs.pytorch.org/docs/stable/generated/torch.nn.Linear.html)
