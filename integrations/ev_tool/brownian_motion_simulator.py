"""Brownian motion simulation for financial modeling"""
import numpy as np

def simulate_brownian_motion(S0, T, n, r, sigma):
    """Simulate Brownian motion paths"""
    dt = T / n
    Z = np.sqrt(dt) * np.random.standard_normal(n)
    S_T = S0 * np.exp((r - 0.5 * sigma ** 2) * T + sigma * Z)
    return S_T
