// Beginner Guide progress: lessons are marked done when opened or with "Mark as done", and
// remembered in this browser.
const KEY = 'vo-beginner-guide-v1';
const lessons = [...document.querySelectorAll('[data-lesson]')];
const slugs = lessons.map(lesson => lesson.dataset.lesson);
let done;
try { done = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').filter(slug => slugs.includes(slug))); } catch { done = new Set(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch {} };

function render() {
  for (const lesson of lessons) {
    const isDone = done.has(lesson.dataset.lesson);
    lesson.classList.toggle('is-done', isDone);
    const mark = lesson.querySelector('[data-mark]');
    mark.setAttribute('aria-pressed', String(isDone));
    mark.querySelector('span').textContent = isDone ? 'Done' : 'Mark as done';
  }
  document.querySelectorAll('[data-outline]').forEach(item => item.classList.toggle('is-done', done.has(item.dataset.outline)));
  document.querySelector('#bg-done').textContent = String(done.size);
  document.querySelector('#bg-bar').style.width = `${(done.size / slugs.length) * 100}%`;
  document.querySelector('.bg-progress-bar').setAttribute('aria-valuenow', String(done.size));
  const nextIndex = slugs.findIndex(slug => !done.has(slug));
  const next = document.querySelector('#bg-continue');
  if (nextIndex === -1) {
    next.href = '/research';
    next.firstChild.textContent = 'All done. Open the workspace ';
  } else {
    next.href = lessons[nextIndex].querySelector('a[data-lesson-link]').getAttribute('href');
    next.firstChild.textContent = `${done.size ? 'Continue with' : 'Start'} lesson ${nextIndex + 1} `;
  }
}

document.addEventListener('click', event => {
  const mark = event.target.closest('[data-mark]');
  if (mark) {
    const slug = mark.dataset.mark;
    done.has(slug) ? done.delete(slug) : done.add(slug);
    save(); render();
    return;
  }
  const link = event.target.closest('[data-lesson-link]');
  if (!link) return;
  const slug = link.getAttribute('href').split('/').pop();
  if (slugs.includes(slug)) { done.add(slug); save(); }
});
render();
