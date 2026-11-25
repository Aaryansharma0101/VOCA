"""Offline data pipeline: datasets, embeddings, scrapers and trend jobs.

Nothing in this package is imported by ``app.main``. These modules run from the
command line (or a scheduler in a separate process), so a slow scrape can never
sit inside a user request.
"""
