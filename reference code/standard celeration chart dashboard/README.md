# Standard Celeration Chart Dashboard

A digital implementation of Ogden Lindsley's Standard Celeration Chart for Precision Teaching.

## Live Demo

**[Open the Dashboard](https://lbranigan.github.io/standard-celeration-chart/)**

## Features

- **Semi-logarithmic Standard Celeration Chart**
  - Y-axis: Count per minute (0.001 to 1000) - logarithmic scale
  - X-axis: Successive calendar days (0-140) - linear scale
  - Week markers at top (0-20 weeks)

- **Zoom Controls**
  - 1 Week, 1 Month, 3 Months, Full (140 days)

- **Multiple Students**
  - Import JSON data via button or drag-and-drop
  - Color-coded overlays for comparing students
  - Toggle students on/off

- **Metric Toggles**
  - Correct/Min (green dots)
  - Errors/Min (red X marks)
  - WPM, Accuracy %, Prosody Score

- **Display Options**
  - Celeration lines (trend lines)
  - Data points
  - Record floor
  - Connect points

- **Statistics Panel**
  - Celeration calculations (x2.35, /1.5 format)
  - Average metrics

## Usage

1. Open the dashboard
2. Click "Import JSON" or drag-and-drop a JSON file
3. Use zoom controls to adjust the view
4. Toggle metrics and display options as needed
5. Import multiple students to compare progress

## Data Format

The dashboard accepts JSON exports from Word Analyzer V2 with this structure:

```json
{
  "student": {
    "name": "Student Name",
    "id": "unique-id"
  },
  "assessments": [
    {
      "celeration": {
        "date": "2025-01-01",
        "calendarDay": 1,
        "correctPerMinute": 45.5,
        "errorsPerMinute": 12.3,
        "countingTimeMin": 1.0
      },
      "performance": {
        "accuracy": 85.5,
        "wpm": 120
      },
      "prosody": {
        "score": 3.2
      }
    }
  ]
}
```

## About Precision Teaching

Precision Teaching is a measurement-driven approach to education developed by Ogden Lindsley in the 1960s. The Standard Celeration Chart allows educators to:

- Track student progress over time
- Identify learning trends (celeration)
- Make data-driven instructional decisions
- Compare performance across students

Key concepts:
- **Frequency**: Count per minute (the primary datum)
- **Celeration**: Rate of change in frequency (multiply/divide per week)
- **Bounce**: Variability in performance

## References

- [Standard Celeration Society](https://celeration.org/)
- [Precision Teaching - Wikipedia](https://en.wikipedia.org/wiki/Precision_teaching)
- [Morningside Academy](https://morningsideacademy.org/)

## License

MIT License - Feel free to use and modify.
