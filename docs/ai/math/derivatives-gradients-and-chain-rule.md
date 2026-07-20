---
title: 导数、梯度与链式法则
description: 从局部变化率理解偏导数、梯度、计算图和反向传播基础
outline: deep
---

# 导数、梯度与链式法则

> 本课讲稳定的微积分原理，并用手算和有限差分验证梯度。自动微分框架将在 PyTorch 模块正式使用。

## 1. 学习目标

- 用极限和局部线性近似解释导数。
- 区分导数、偏导数、方向导数、梯度和 Jacobian。
- 解释为什么梯度指向函数上升最快方向。
- 使用链式法则求复合函数导数。
- 沿计算图反向累积梯度。
- 区分符号求导、数值微分和自动微分。
- 使用中心差分检查解析梯度并理解其误差。

## 2. 导数回答什么问题

对标量函数 \(y=f(x)\)，导数描述输入在某点发生极小变化时，输出的一阶变化率：

\[
f'(x)=\lim_{h\to0}\frac{f(x+h)-f(x)}{h}
\]

当 \(h\) 很小时：

\[
f(x+h)\approx f(x)+f'(x)h
\]

这是一阶局部线性近似。导数不是“函数整体增长速度”，而是特定点附近的局部斜率。

例如 \(f(x)=x^2\)：

\[
f'(x)=2x
\]

在 \(x=3\) 处斜率为 6，因此输入增加 0.01 时，输出大约增加 0.06。

## 3. 可导、连续与不可导点

可导必然连续，但连续不一定可导。例如：

\[
f(x)=|x|
\]

在 0 连续，但左右导数分别为 -1 和 1，因此普通导数不存在。

ReLU：

\[
\operatorname{ReLU}(x)=\max(0,x)
\]

在 0 也不可导。深度学习框架通常为此点选择一个约定的次梯度值。这属于 API 行为；不会让经典导数突然存在。

## 4. 常用求导规则

\[
\frac{d}{dx}c=0,
\qquad
\frac{d}{dx}x^n=nx^{n-1}
\]

\[
(f+g)'=f'+g'
\]

\[
(fg)'=f'g+fg'
\]

\[
\left(\frac{f}{g}\right)'
=\frac{f'g-fg'}{g^2}
\quad(g\ne0)
\]

这些规则由导数定义推导而来，不是互不相关的记忆口诀。

## 5. 偏导数

对多变量标量函数：

\[
f:\mathbb{R}^n\rightarrow\mathbb{R}
\]

偏导数 \(\partial f/\partial x_i\) 表示只改变第 \(i\) 个变量、暂时固定其他变量时的变化率。

例如：

\[
f(x,y)=x^2+3xy+y^2
\]

\[
\frac{\partial f}{\partial x}=2x+3y,
\qquad
\frac{\partial f}{\partial y}=3x+2y
\]

偏导数只看坐标轴方向；要同时描述所有输入方向，需要梯度。

## 6. 梯度

梯度把全部偏导数组成向量：

\[
\nabla f(\mathbf{x})=
\begin{bmatrix}
\partial f/\partial x_1\\
\vdots\\
\partial f/\partial x_n
\end{bmatrix}
\]

梯度形状与输入向量相同，前提是输出是标量。对上例：

\[
\nabla f(x,y)=
\begin{bmatrix}2x+3y\\3x+2y\end{bmatrix}
\]

在 \((1,2)\) 处：

\[
\nabla f(1,2)=\begin{bmatrix}8\\7\end{bmatrix}
\]

## 7. 方向导数与最陡方向

沿单位向量 \(\mathbf{u}\) 的方向导数为：

\[
D_{\mathbf{u}}f(\mathbf{x})
=\mathbf{u}^{\mathsf T}\nabla f(\mathbf{x})
\]

根据点积公式，它在 \(\mathbf{u}\) 与梯度同向时最大，反向时最小。因此：

- 梯度指向局部上升最快方向；
- 负梯度指向局部下降最快方向。

梯度下降据此更新参数：

\[
\boldsymbol{\theta}_{t+1}
=\boldsymbol{\theta}_t
-\eta\nabla_{\boldsymbol{\theta}}L(\boldsymbol{\theta}_t)
\]

\(\eta\) 是学习率。负梯度只是局部最佳方向，不保证一步到达全局最小值；步长过大还可能让损失上升。

## 8. 链式法则

若：

\[
y=f(u),\qquad u=g(x)
\]

则：

\[
\frac{dy}{dx}
=\frac{dy}{du}\frac{du}{dx}
\]

例如：

\[
y=(wx+b)^2
\]

令 \(u=wx+b\)，则：

\[
\frac{\partial y}{\partial w}
=\frac{\partial y}{\partial u}
\frac{\partial u}{\partial w}
=2u\cdot x
\]

链式法则把复杂函数拆成局部导数的乘积，是反向传播的数学核心。

## 9. 分支处的梯度要相加

若变量通过多条路径影响最终损失，所有路径贡献需要相加。例如：

\[
L=x^2+3x
\]

\[
\frac{dL}{dx}=2x+3
\]

计算图中同一个节点被多个后继使用时，反向传播会累积梯度，而不是任选一条路径。

## 10. Jacobian 与梯度的关系

若：

\[
\mathbf{f}:\mathbb{R}^m\rightarrow\mathbb{R}^n
\]

Jacobian 为：

\[
\mathbf{J}_{ij}=\frac{\partial f_i}{\partial x_j}
\in\mathbb{R}^{n\times m}
\]

标量输出 \(n=1\) 时，Jacobian 与梯度包含相同偏导数，只是行列约定可能不同。深度学习通常不显式构造巨大 Jacobian，而计算向量-Jacobian 或 Jacobian-向量乘积。

## 11. Hessian 与曲率直觉

标量函数的二阶偏导数组成 Hessian：

\[
\mathbf{H}_{ij}
=\frac{\partial^2 f}{\partial x_i\partial x_j}
\]

梯度描述坡度，Hessian 描述坡度如何变化，也就是局部曲率。临界点 \(\nabla f=0\) 可能是极小值、极大值或鞍点，不能仅凭梯度为零判断。

## 12. 三种“求导”方式

### 符号求导

操作数学表达式，得到新的解析表达式。结果可读，但复杂图会发生表达式膨胀。

### 数值微分

中心差分：

\[
f'(x)\approx\frac{f(x+h)-f(x-h)}{2h}
\]

实现简单，适合梯度检查，但每个参数都要重复前向计算，且存在截断误差与浮点舍入误差。

### 自动微分

自动微分记录基本运算并应用精确的局部导数与链式法则。它不是符号化简，也不是用有限差分近似。反向模式特别适合“许多参数、一个标量损失”的神经网络。

## 13. 有限差分的步长不是越小越好

较大的 \(h\) 带来截断误差；过小的 \(h\) 会让两个接近浮点数相减，放大舍入误差。梯度检查还应：

- 使用相对误差；
- 尽量使用更高精度；
- 避开不可导点；
- 对随机层固定随机性；
- 只抽查部分参数以控制成本。

## 14. 可运行示例

配套文件 `examples/ai/math/gradient_and_chain_rule.py` 对：

\[
L(w,b)=(wx+b-y)^2
\]

计算解析梯度、有限差分梯度，并执行若干步梯度下降。

```bash
python3 examples/ai/math/gradient_and_chain_rule.py
```

## 15. 常见误解

- 梯度为零不保证是最小值，也可能是最大值、鞍点或平台。
- 偏导数存在不总能保证函数可微；可微要求统一的局部线性近似。
- 自动微分给出的梯度仍依赖程序实际执行的计算图，错误的前向程序会得到“精确但针对错误函数”的梯度。
- 梯度大不等于参数重要；尺度、参数化和数据单位都会影响梯度。
- 反向传播是高效应用链式法则的算法，不等于整个训练算法；训练还包括损失、优化器、数据和更新规则。

## 16. 本课小结

- 导数是局部变化率，也是函数的一阶线性近似系数。
- 偏导数固定其他坐标，梯度收集标量输出对所有输入的偏导。
- 方向导数是方向与梯度的点积，负梯度给出局部最陡下降方向。
- 链式法则把复合函数导数分解为局部导数；分支路径的贡献需要相加。
- Jacobian 处理向量输出，Hessian 描述标量函数的二阶曲率。
- 自动微分精确应用链式法则，有限差分主要用于独立检查。

下一课将学习梯度下降、学习率、局部极值、凸性和数值稳定性，把微积分真正连接到模型训练。

## 17. 参考资料

- [Goodfellow、Bengio 与 Courville：《Deep Learning》第 4 章](https://www.deeplearningbook.org/contents/numerical.html)
- [PyTorch：Autograd mechanics](https://docs.pytorch.org/docs/stable/notes/autograd.html)
- [PyTorch：Automatic differentiation tutorial](https://docs.pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html)
