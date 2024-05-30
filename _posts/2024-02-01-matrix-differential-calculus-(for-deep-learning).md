---
layout: post
title: "Matrix differential calculus (for deep learning)"
date: 2024-02-01
author: "Charles London"
usemathjax: true
image: /assets/images/2024-02-01-matrix-differential-calculus-(for-deep-learning)/nn_arch.png
---

During my time as both a mathematics and machine learning student and researcher, I’ve often had reason to take derivatives with respect to both vectors and matrices. In particular, when learning how backpropagation works in neural networks, I think the matrix formalism is much nicer than calculating gradients for weights individually. Still, I’ve often found the notation confusing and unhelpful. The chain rule is a particular sticking point when performing matrix calculus, as intermediate quantities are often third- or fourth-order tensors. This is where calculating these derivatives using differentials (matrix differential calculus) can come to your aid.

In this post, I’ll show how you can use matrix differential calculus to calculate important derivatives for backpropagation in a simple feedforward neural network. I am largely writing this as a reference for myself, but I hope it might be of some use to others.

## Preliminaries

{% include image.html file="/assets/images/2024-02-01-matrix-differential-calculus-(for-deep-learning)/nn_arch.png" description="Simple feedforward NN architecture." %}

We will consider a very simple feedforward neural network architecture, with no biases, and $$N$$ layers with weights $$W_n \in \mathbb{R}^{d_n} \times \mathbb{R}^{d_{n-1}}$$. Each layer (but the last) will process the data as:

$$
\boldsymbol{z}_{n} = W_{n} \bm{a}_{n-1} \\
\bm{a}_{n} = \sigma(\bm{z}_{n})
$$

Here $$\bm{z}_{n}$$ is the pre-activation output of layer $$n$$, $$\bm{a}_n$$ is the post-activation output, and $$\sigma$$ is our activation function, for which we will only assume differentiability. Note that for $$W_1$$ we have that $$\bm{a}_0 = \bm{x}$$, our input. The final layer will not have any activation $$\sigma$$, but we will instead pass $$\bm{z}_{N}$$ to a function $$f$$ (the loss function), giving:

$$
l = f(\bm{z}_{N})
$$

In general, you will probably have seen all the notation used in this post before, but something you may not have come across is:

$$
A : B = \text{tr}(A^T B) = \sum_{i,j} A_{ij} B_{ij}
$$

This is the Frobenius inner product of two (real) matrices of the same dimension, and can often make long linear algebra expressions that result in a scalar simpler. It has the properties:

$$
A : B = B : A = B^T : A^T = A^T : B^T \\
AB : C = A : CB^T = B : A^TC
$$

And is also defined for vectors as:

$$
\bm{a} : \bm{b} = \bm{a}^T\bm{b}
$$

## Backpropagation

For each of our layers $$n$$, we will assume that we have access to $$\frac{\partial l}{\partial \bm{z}_{n}}$$  flowing backwards from the subsequent layer (and by chaining the following calculations together, we will). Given this, we want to calculate the derivative of $$l$$ with respect to $$W_n$$, so that we can update our parameters in layer $$n$$, and with respect to $$\bm{z}_{n-1}$$, so that we can continue propagating the gradient to the earlier layers.

First, we’ll use matrix differential calculus to find the derivative with respect to $$W_n$$, while keeping everything else constant:

$$
\begin{aligned}
\text{d}l &= \frac{\partial l}{\partial \bm{z}_{n}} \text{d}\bm{z}_{n}\\
&= \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T  :\text{d}\bm{z}_{n} \\
&= \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T : \text{d}W_n \bm{a}_{n-1} \\
&= \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T \bm{a}_{n-1}^T : \text{d}W_n
\end{aligned}
$$

And so, finally:

$$
\frac{\partial l}{\partial W_n} = \bm{a}_{n-1} \frac{\partial l}{\partial \bm{z}_{n}}
$$

You will notice at the end here that we have lost (or equivalently gained) the transpose that appeared before the Frobenius product in our expression. This is due both to the definition of the Frobenius product, and the fact that I am using **[numerator](https://en.wikipedia.org/wiki/Matrix_calculus#Layout_conventions)** layout for the derivatives, which states that a scalar-by-matrix derivative taken with respect to $$W_n$$ should have dimensions the same as $$W_n^T$$. This is a little odd, but I am enforcing it here to ensure that we also maintain the convention of scalar-by-vector derivatives with respect to a column vector $$\bm{z}_n$$ being row vectors (think of them as matrices with dimensions $$d_n \times 1$$ and $$1 \times d_n$$ respectively).

In my opinion, despite these quirks, this notation is quite a lot easier than trying to fiddle around with the chain rule (where we might have to calculate $$\frac{\partial \bm{z}_{n}}{\partial W_n}$$, which is a third-order tensor)! Now that we’ve done that, finding the derivative with respect to $$\bm{z}_{n-1}$$ only requires a little more work:

$$
\begin{aligned}
\text{d}l &= \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T : W_n \text{d}\bm{a}_{n-1} \\
&= W_n^T \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T : \text{d}\bm{a}_{n-1} \\
&= W_n^T \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T : \frac{\partial \bm{a}_{n-1}}{\partial \bm{z}_{n-1}} \text{d}\bm{z}_{n-1} \\
&= \left(\frac{\partial \bm{a}_{n-1}}{\partial \bm{z}_{n-1}}\right)^T W_n^T \left(\frac{\partial l}{\partial \bm{z}_{n}}\right)^T : \text{d}\bm{z}_{n-1} \\
\end{aligned}
$$

Resulting in:

$$
\frac{\partial l}{\partial \bm{z}_{n-1}} = \frac{\partial l}{\partial \bm{z}_{n}} W_n \frac{\partial \bm{a}_{n-1}}{\partial \bm{z}_{n-1}}
$$

Again, we’ve lost the transpose to respect the conventions of numerator layout.

A possible small point of contention with these derivations is that I haven’t actually computed

$$
\frac{\partial \bm{a}_{n-1}}{\partial \bm{z}_{n-1}} = \frac{\partial \sigma(\bm{z}_{n-1})}{\partial \bm{z}_{n-1}}.
$$

However, as I have assumed that $$\sigma$$ is differentiable, we know this derivative exists. The exact form will depend on the activation function used, but most common neural network activation functions are element-wise, in which case it will be a simple diagonal matrix.

## Dealing with loss functions

While the formulae above have shown us how we can calculate all the gradients we need once we have $$\frac{\partial l}{\partial \bm{z}_{n}}$$, in order to start the whole chain off, we need $$\frac{\partial l}{\partial \bm{z}_{N}}$$. For some loss functions, such as cross-entropy with softmax, there isn’t an easy way to do this with matrix calculus, as the softmax function can’t be written as a product of matrices and vectors (or at least, not a nice one). In these cases, if you wish to write it out analytically, you will probably have to resort to scalar calculus on the individual elements of $$\bm{z}_N$$. However, in the case of regression, where we use the squared error, we can again turn to matrix differential calculus, though, in this case, I think the advantages are much less pronounced. We will use $$\hat{\bm{y}}$$ to denote the true value that we want the network to approximate, and our loss function is:

$$
\begin{aligned}
l &= (\bm{z}_N - \hat{\bm{y}})^T(\bm{z}_N - \hat{\bm{y}}) \\
&= (\bm{z}_N - \hat{\bm{y}}) : (\bm{z}_N - \hat{\bm{y}})
\end{aligned}
$$

We can then calculate the derivative with respect to $$\bm{z}_N$$ by:

$$
\begin{aligned}
\text{d}l &= \text{d}(\bm{z}_N - \hat{\bm{y}}) : (\bm{z}_N - \hat{\bm{y}}) + (\bm{z}_N - \hat{\bm{y}}) : \text{d}(\bm{z}_N - \hat{\bm{y}}) \\
&= 2(\bm{z}_N - \hat{\bm{y}}) : \text{d}(\bm{z}_N - \hat{\bm{y}}) \\
&= 2(\bm{z}_N - \hat{\bm{y}}) : \text{d}\bm{z}_N \\
\implies \frac{\partial l}{\partial z_N} &= 2(\bm{z}_N - \hat{\bm{y}})^T
\end{aligned}
$$

I do believe that this method improves clarity here, even if it is by less than in the backpropagation derivations.

## Useful matrix differential identities

{% include image.html file="/assets/images/2024-02-01-matrix-differential-calculus-(for-deep-learning)/matrix_calc.png" description="Matrix differential identities from" link="https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf" linktext="The Matrix Cookbook" %}

The identities above may be useful when computing more difficult derivatives.

---

### References

1. [greg, matrices - applying the chain rule for taking the derivative w.r.t a matrix, Mathematics Stack Exchange, 2020](https://math.stackexchange.com/a/3916816)
2. [K.B. Petersen and M.S. Petersen, The Matrix Cookbook, 2012](https://www.math.uwaterloo.ca/~hwolkowi/matrixcookbook.pdf)
3. [G.J. Gordon, Matrix differentials, 2022](https://www.cs.cmu.edu/~ggordon/10606s22/matrix-differential.pdf)
4. J.R. Magnus, and H. Neudecker, Matrix differential calculus with applications in statistics and econometrics, 2019.