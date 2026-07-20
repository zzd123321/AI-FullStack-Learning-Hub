---
title: 协方差、相关系数、常见分布与大数定律
description: 理解变量共同变化、分布假设、抽样平均与经验估计
outline: deep
---

# 协方差、相关系数、常见分布与大数定律

> 本课关注稳定的概率原理。示例使用 Python 标准库；分布 API 和统计检验将在数据工具模块按版本讲解。

## 1. 学习目标

完成本节后，你应该能够：

- 计算并解释协方差与 Pearson 相关系数。
- 区分独立、不相关、相关和因果关系。
- 理解协方差矩阵的结构与半正定性。
- 根据数据生成过程识别 Bernoulli、Categorical、Binomial 和正态分布。
- 区分分布、样本和参数。
- 使用大数定律解释样本均值为何趋近理论期望。
- 区分大数定律与中心极限定理。
- 识别抽样偏差、分布漂移和相关性误用。

## 2. 从一个变量的方差到两个变量的共同变化

方差描述一个变量围绕自身均值的波动：

\[
\operatorname{Var}(X)=\mathbb{E}[(X-\mu_X)^2]
\]

如果想知道 \(X\) 较大时 \(Y\) 是否也倾向较大，就使用协方差：

\[
\operatorname{Cov}(X,Y)
=\mathbb{E}[(X-\mu_X)(Y-\mu_Y)]
\]

等价形式为：

\[
\operatorname{Cov}(X,Y)
=\mathbb{E}[XY]-\mathbb{E}[X]\mathbb{E}[Y]
\]

- 正协方差：两个变量倾向同向偏离均值；
- 负协方差：倾向反向偏离；
- 协方差为 0：没有检测到线性共同变化。

方差是协方差的特例：

\[
\operatorname{Cov}(X,X)=\operatorname{Var}(X)
\]

## 3. 协方差受单位影响

若把 \(X\) 从米换算为厘米，数值放大 100 倍：

\[
\operatorname{Cov}(aX+b,cY+d)
=ac\operatorname{Cov}(X,Y)
\]

平移不改变协方差，缩放会改变其大小甚至符号。因此不同变量对的协方差绝对值通常不能直接比较。

## 4. Pearson 相关系数

当两个标准差都非零时：

\[
\rho_{X,Y}
=\frac{\operatorname{Cov}(X,Y)}
{\sigma_X\sigma_Y}
\]

它把协方差标准化到 \([-1,1]\)：

- \(1\)：完全正线性关系；
- \(-1\)：完全负线性关系；
- 接近 0：线性关系较弱。

相关系数没有单位，对正比例缩放不敏感。但它只概括线性关系。若 \(Y=X^2\) 且 \(X\) 关于 0 对称，二者显然依赖，Pearson 相关却可能为 0。

若任一变量方差为 0，相关系数分母为 0，在数学上未定义。

## 5. 独立、不相关与因果

若期望存在且 \(X,Y\) 独立，则：

\[
\mathbb{E}[XY]=\mathbb{E}[X]\mathbb{E}[Y]
\]

从而协方差为 0。但反方向一般不成立：不相关只排除了线性共同变化，不能排除非线性依赖。

相关也不等于因果。观察到相关可能来自：

- \(X\) 导致 \(Y\)；
- \(Y\) 导致 \(X\)；
- 第三个变量同时影响二者；
- 选择偏差或测量过程；
- 时间趋势；
- 偶然波动或多重比较。

因果判断需要因果假设、实验设计或专门方法，不能只看相关矩阵。

## 6. 样本协方差与总体协方差

总体协方差是分布性质。有限样本 \((x_i,y_i)_{i=1}^n\) 常用：

\[
s_{XY}
=\frac{1}{n-1}\sum_{i=1}^{n}
(x_i-\bar{x})(y_i-\bar{y})
\]

分母 \(n-1\) 给出常见的无偏样本协方差估计。使用 \(1/n\) 则是另一种统计量或最大似然语境下的形式。调用软件时必须确认自由度约定。

样本相关只是未知总体关系的估计。小样本、异常值和范围截断都可能让它很不稳定。

## 7. 协方差矩阵

随机向量 \(\mathbf{X}\in\mathbb{R}^d\) 的协方差矩阵：

\[
\mathbf{\Sigma}
=\mathbb{E}[(\mathbf{X}-\boldsymbol{\mu})
(\mathbf{X}-\boldsymbol{\mu})^{\mathsf T}]
\]

其中：

\[
\Sigma_{ij}=\operatorname{Cov}(X_i,X_j)
\]

它是对称半正定矩阵，因为任意向量 \(\mathbf{a}\) 都满足：

\[
\mathbf{a}^{\mathsf T}\mathbf{\Sigma}\mathbf{a}
=\operatorname{Var}(\mathbf{a}^{\mathsf T}\mathbf{X})\ge0
\]

这也解释了 PCA 中协方差矩阵特征值为何非负：每个特征方向上的特征值就是投影方差。

## 8. 分布是数据生成规律的模型

写作：

\[
X\sim P_\theta
\]

表示随机变量遵循参数为 \(\theta\) 的分布。需要区分：

- 分布：对所有可能取值及概率的描述；
- 参数：控制分布形状的固定但可能未知的量；
- 样本：从分布进行有限次抽取得到的数据；
- 统计量：由样本计算的函数，例如样本均值。

数据通常不会“证明自己属于某个分布”。分布是需要结合生成机制、诊断和任务目的检查的建模假设。

## 9. Bernoulli 分布

一次二元结果：

\[
X\sim\operatorname{Bernoulli}(p),
\qquad X\in\{0,1\}
\]

\[
P(X=1)=p,
\qquad P(X=0)=1-p
\]

其期望与方差：

\[
\mathbb{E}[X]=p,
\qquad
\operatorname{Var}(X)=p(1-p)
\]

它可描述一次点击、一次检测结果或二分类标签。它描述随机结果，不代表任何二分类任务都天然满足样本独立、参数固定等附加假设。

## 10. Categorical 与 Binomial 分布

Categorical 分布描述一次多类别抽样：

\[
P(X=k)=p_k,
\qquad \sum_{k=1}^{K}p_k=1
\]

语言模型对下一个 Token 的分布就是一个高维 Categorical 分布，实际解码还会加入温度、截断或其他策略。

Binomial 分布描述 \(n\) 次相互独立、成功概率相同的 Bernoulli 试验中成功次数：

\[
S\sim\operatorname{Binomial}(n,p)
\]

\[
P(S=k)=\binom{n}{k}p^k(1-p)^{n-k}
\]

\[
\mathbb{E}[S]=np,
\qquad
\operatorname{Var}(S)=np(1-p)
\]

若试验不独立或成功概率随时间变化，直接使用 Binomial 模型可能不合适。

## 11. 正态分布

\[
X\sim\mathcal{N}(\mu,\sigma^2)
\]

密度为：

\[
f(x)=\frac{1}{\sqrt{2\pi\sigma^2}}
\exp\left(-\frac{(x-\mu)^2}{2\sigma^2}\right)
\]

它由均值与方差决定，关于 \(\mu\) 对称。正态分布广泛用于测量误差、线性模型噪声和近似推断，但并非所有连续数据都近似正态；偏态、厚尾、多峰和有界数据需要其他模型。

多元正态分布由均值向量与协方差矩阵描述。协方差决定等密度轮廓的方向和伸展程度。

## 12. 大数定律

设 \(X_1,X_2,\ldots\) 在适当条件下独立同分布，且期望 \(\mu\) 存在。样本均值：

\[
\bar{X}_n=\frac{1}{n}\sum_{i=1}^{n}X_i
\]

随着 \(n\) 增大，会以大数定律规定的方式趋近 \(\mu\)。弱大数定律描述依概率收敛：

\[
P(|\bar{X}_n-\mu|>\varepsilon)\rightarrow0
\]

它不表示：

- 有限样本均值必然单调接近期望；
- 每个样本都接近期望；
- 数据有偏时增加样本就能消除偏差；
- 任意相关、漂移或重尾序列都自动满足同一结论。

机器学习用有限训练集上的平均损失近似总体期望损失，正依赖抽样与泛化假设，而不只是“数据越多越好”。

## 13. 大数定律与中心极限定理不同

大数定律关注样本均值**趋向哪里**：趋近期望。

中心极限定理关注经过中心化和缩放的样本均值**分布形状如何**。在经典条件下：

\[
\sqrt{n}\frac{\bar{X}_n-\mu}{\sigma}
\xrightarrow{d}\mathcal{N}(0,1)
\]

中心极限定理并不是说原始数据会变成正态分布，也不是所有小样本均值都已经近似正态。具体条件和收敛速度需要单独检查。

## 14. 可运行示例

配套文件 `examples/ai/math/correlation_and_lln.py` 展示：

- 总体式协方差与 Pearson 相关；
- 缩放如何改变协方差但保持相关系数；
- 非线性依赖可能具有零相关；
- Bernoulli 样本均值随样本量增长接近 \(p\)。

运行：

```bash
python3 examples/ai/math/correlation_and_lln.py
```

## 15. 常见误解

### “相关系数为 0 就表示独立”

一般不成立，它只排除了 Pearson 意义下的线性关系。

### “相关性高就证明存在因果关系”

不成立。混杂、反向因果和选择偏差都可能制造相关。

### “数据量足够大就没有偏差”

大数据会减小某些随机误差，但不会自动修复系统性采样偏差、标签错误或分布错位。

### “大数定律保证每次实验都越来越准”

它描述收敛性质，不保证有限样本路径单调。

### “中心极限定理说明所有数据都是正态的”

它在条件成立时描述规范化样本和或均值的极限分布，不改变原始数据分布。

## 16. 本课小结

- 协方差描述线性共同变化，但受单位影响；相关系数进行标准化。
- 独立通常推出不相关，反方向一般不成立；相关不等于因果。
- 协方差矩阵是对称半正定矩阵，连接概率统计与 PCA。
- Bernoulli、Categorical、Binomial 和正态分布对应不同生成过程与假设。
- 大数定律说明适当条件下样本均值趋近期望，不会消除系统性偏差。
- 中心极限定理研究规范化样本均值的分布，不等同于大数定律。

下一课将学习导数、偏导数、梯度与链式法则，为损失最小化和反向传播建立数学基础。

## 17. 参考资料

- [Goodfellow、Bengio 与 Courville：《Deep Learning》第 3 章](https://www.deeplearningbook.org/contents/prob.html)
- [NIST：Probability Distributions](https://www.itl.nist.gov/div898/handbook/eda/section3/eda36.htm)
- [NIST：Normal Distribution](https://www.itl.nist.gov/div898/handbook/pmc/section5/pmc51.htm)
- [SciPy：Probability distributions](https://docs.scipy.org/doc/scipy/tutorial/stats/probability_distributions.html)
