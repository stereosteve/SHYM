let nowPlaying = ''

// auto-play next
player.addEventListener('ended', function () {
  const next = document.querySelector('.nowPlaying ~ .track')
  if (next) {
    play(next.getAttribute('id'))
  }
})

function play(id, key) {
  if (nowPlaying == id) {
    player.paused ? player.play() : player.pause()
  } else {
    $('.nowPlaying').map((e) => e.classList.remove('nowPlaying'))
    $(`#${id}`).map((e) => e.classList.add('nowPlaying'))
    nowPlaying = id
    player.src = `/upload/${key}`
    player.play()
  }
}

function $(sel) {
  return Array.from(document.querySelectorAll(sel))
}
