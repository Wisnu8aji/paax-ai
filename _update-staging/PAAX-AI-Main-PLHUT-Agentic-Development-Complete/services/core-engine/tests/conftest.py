import os

# The internal-service test key (see app/auth.py) is only ever a valid bypass
# under an explicit TESTING=1 flag -- never merely because ENV defaults to
# "development" when unset. Set it once here for the whole test suite rather
# than relying on a loose ENV default that a misconfigured production
# deployment could also satisfy.
os.environ.setdefault("TESTING", "1")
