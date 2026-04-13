import React, { useState, useEffect } from 'react'
import { Text } from 'ink'
import { getTheme, resolveTheme } from '../theme.js'

const theme = getTheme(resolveTheme())

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function Spinner() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return <Text color={theme.brand}>{frames[frame]}</Text>
}
