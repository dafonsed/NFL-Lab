import test from 'node:test';
import assert from 'node:assert/strict';
import { searchHelp, renderHelpResults } from '../public/help-search.js';

const articles=[
  {slug:'recover-account',title:'Recover your account',summary:'Reset access when you cannot sign in.',collectionTitle:'Account',searchText:'Choose a new password after opening your reset email.'},
  {slug:'change-password',title:'Change your password',summary:'Update your sign-in password.',collectionTitle:'Account',searchText:'Enter the current password in account security.'},
  {slug:'track-picks',title:'Track your picks',summary:'Save a record in the tracker.',collectionTitle:'Research',searchText:'A saved pick is not a sportsbook wager.'}
];
test('help search ranks title matches above article text and requires every query term',()=>{
  assert.deepEqual(searchHelp(articles,'PASSWORD').map(article=>article.slug),['change-password','recover-account']);
  assert.deepEqual(searchHelp(articles,'reset email').map(article=>article.slug),['recover-account']);
  assert.deepEqual(searchHelp(articles,'password tracker'),[]);
  assert.deepEqual(searchHelp(articles,'   '),[]);
});
test('help results escape query, source text and maintain help-host article links',()=>{
  const html=renderHelpResults([{...articles[0],title:'<img src=x onerror=alert(1)>',searchText:'reset'}],'reset',{articleBase:'/articles',ticketHref:'https://app.example/support#new-report'});
  assert.match(html,/href="\/articles\/recover-account"/);
  assert.doesNotMatch(html,/<img/);
  assert.match(html,/&lt;img/);
  const empty=renderHelpResults(articles,'<script>alert(1)</script>');
  assert.doesNotMatch(empty,/<script>/);
  assert.match(empty,/No articles found/);
  assert.match(empty,/href="\/support#new-report"/);
});
