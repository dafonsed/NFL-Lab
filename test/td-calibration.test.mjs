import test from 'node:test';
import assert from 'node:assert/strict';
import { TD_CALIBRATION_VERSION, calibratedTdProbability, fitTdCalibration, tdProbabilityMetrics } from '../lib/td-calibration.mjs';

test('fit learns a monotone score-to-outcome relationship and blocks training-season use',()=>{
 const rows=Array.from({length:400},(_,i)=>({season:2024,score:i<200?20:80,position:'RB',outcome:i<200?Number(i%20===0):Number(i%4===0)}));
 const model=fitTdCalibration(rows);
 assert.equal(model.version,TD_CALIBRATION_VERSION);
 const low=calibratedTdProbability(20,'RB',model,2025),high=calibratedTdProbability(80,'RB',model,2025);
 assert.ok(low<.15);assert.ok(high>.15);assert.ok(high>low);
 assert.equal(calibratedTdProbability(80,'RB',model,2024),null);
 assert.equal(calibratedTdProbability(null,'RB',model,2025),null);
});

test('probability check uses only rows with a valid forecast and outcome',()=>{
 const result=tdProbabilityMetrics([{outcome:1,p:.8},{outcome:0,p:.2},{outcome:1,p:null}],r=>r.p);
 assert.equal(result.n,2);
 assert.ok(Math.abs(result.brier-.04)<1e-10);
 assert.equal(result.bins.reduce((n,b)=>n+b.n,0),2);
});
